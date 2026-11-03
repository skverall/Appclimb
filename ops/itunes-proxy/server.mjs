// AppClimb iTunes proxy.
//
// Apple's public iTunes Search API rejects Cloudflare Worker IP ranges, so
// the MCP server (which has no browser to borrow) reaches /search and
// /lookup through this small service on the Hostinger VPS. It only forwards
// the two read-only endpoints, trims search results to the fields AppClimb
// scores, caches answers for a few hours, and paces calls to Apple's
// documented ~20 requests a minute. No dependencies; Node 22.

import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.PROXY_SECRET || "";
const ITUNES_ORIGIN = "https://itunes.apple.com";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const CACHE_MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES || 1500);
const UPSTREAM_TIMEOUT_MS = 12_000;
// Token bucket: Apple documents roughly 20 calls a minute per address.
const BUCKET_CAPACITY = Number(process.env.BUCKET_CAPACITY || 18);
const REFILL_PER_MS = BUCKET_CAPACITY / 60_000;
const MAX_QUEUE_WAIT_MS = 20_000;

if (SECRET.length < 32) {
  console.error("PROXY_SECRET must be set (32+ characters).");
  process.exit(1);
}

const ALLOWED = {
  "/search": ["term", "country", "lang", "media", "entity", "limit", "explicit", "attribute"],
  "/lookup": ["id", "bundleId", "country", "lang", "entity", "limit"],
};

const SEARCH_FIELDS = [
  "trackId",
  "trackName",
  "bundleId",
  "sellerName",
  "primaryGenreName",
  "artworkUrl100",
  "trackViewUrl",
  "userRatingCount",
  "averageUserRating",
];

/** @type {Map<string, { at: number, body: string }>} */
const cache = new Map();
/** @type {Map<string, Promise<{ status: number, body: string }>>} */
const inFlight = new Map();
const stats = { hits: 0, misses: 0, upstreamErrors: 0, throttled: 0 };

let tokens = BUCKET_CAPACITY;
let lastRefill = Date.now();

function refill() {
  const now = Date.now();
  tokens = Math.min(BUCKET_CAPACITY, tokens + (now - lastRefill) * REFILL_PER_MS);
  lastRefill = now;
}

async function takeToken() {
  const deadline = Date.now() + MAX_QUEUE_WAIT_MS;
  for (;;) {
    refill();
    if (tokens >= 1) {
      tokens -= 1;
      return true;
    }
    const wait = Math.ceil((1 - tokens) / REFILL_PER_MS);
    if (Date.now() + wait > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

function authorized(header) {
  const expected = Buffer.from(`Bearer ${SECRET}`);
  const given = Buffer.from(String(header || ""));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function cacheKey(path, params) {
  return `${path}?${[...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")}`;
}

function remember(key, body) {
  cache.delete(key);
  cache.set(key, { at: Date.now(), body });
  while (cache.size > CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

function trimSearch(payload) {
  const results = Array.isArray(payload.results) ? payload.results : [];
  return {
    resultCount: results.length,
    results: results.map((result) => {
      const slim = {};
      for (const field of SEARCH_FIELDS) {
        if (result[field] !== undefined) slim[field] = result[field];
      }
      return slim;
    }),
  };
}

async function fetchApple(path, params) {
  if (!(await takeToken())) {
    stats.throttled += 1;
    return { status: 429, body: JSON.stringify({ error: "busy" }) };
  }
  const response = await fetch(`${ITUNES_ORIGIN}${path}?${params}`, {
    headers: { accept: "application/json", "user-agent": "AppClimb/1.0 (+https://appclimb.app)" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) {
    stats.upstreamErrors += 1;
    return { status: 502, body: JSON.stringify({ error: "upstream", upstreamStatus: response.status }) };
  }
  const payload = await response.json();
  const body = JSON.stringify(path === "/search" ? trimSearch(payload) : payload);
  return { status: 200, body };
}

function send(res, status, body, extra = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extra,
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://proxy.local");
  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, JSON.stringify({ ok: true, cached: cache.size, ...stats }));
  }
  const allowed = ALLOWED[url.pathname];
  if (req.method !== "GET" || !allowed) return send(res, 404, JSON.stringify({ error: "not_found" }));
  if (!authorized(req.headers.authorization)) {
    return send(res, 401, JSON.stringify({ error: "unauthorized" }));
  }

  const params = new URLSearchParams();
  for (const key of allowed) {
    const value = url.searchParams.get(key);
    if (value !== null && value.length <= 200) params.set(key, value);
  }
  const key = cacheKey(url.pathname, params);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    stats.hits += 1;
    return send(res, 200, cached.body, { "x-cache": "hit" });
  }

  stats.misses += 1;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = fetchApple(url.pathname, params).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  try {
    const { status, body } = await pending;
    if (status === 200) remember(key, body);
    return send(res, status, body, { "x-cache": "miss" });
  } catch (error) {
    stats.upstreamErrors += 1;
    console.error("[itunes-proxy]", error instanceof Error ? error.message : String(error));
    return send(res, 502, JSON.stringify({ error: "upstream_unreachable" }));
  }
});

server.listen(PORT, () => console.log(`itunes-proxy listening on ${PORT}`));

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
