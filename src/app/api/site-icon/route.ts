import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  extractIconHrefs,
  fallbackIconUrls,
  isProxyableIconDomain,
  MAX_ICON_BYTES,
  sniffIconContentType,
} from "@/lib/site-icon";
import { normalizeWebDomain } from "@/lib/web-favicon";

/**
 * Same-origin favicon proxy for Web SaaS apps.
 *
 * The app CSP allows `img-src 'self'` only, so favicons cannot be loaded from
 * public icon hosts in the browser. This route resolves the icon server-side,
 * verifies the bytes really are an image, and serves them from our own origin.
 */

const FETCH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (compatible; AppClimbIcons/1.0; +https://appclimb.app)",
  accept:
    "image/avif,image/webp,image/png,image/svg+xml,image/x-icon,image/*;q=0.8,*/*;q=0.5",
};

/** Per-request wall clock budget, so a slow site cannot stall the tab. */
const TOTAL_BUDGET_MS = 8000;
const MARKUP_TIMEOUT_MS = 3000;
const ICON_TIMEOUT_MS = 3000;

/** Enough of a document to cover `<head>` on even the heaviest pages. */
const MAX_MARKUP_BYTES = 200_000;

const SUCCESS_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800";
// Misses are retried the next day rather than being pinned for a week: a site
// that had no icon at signup usually gains one shortly after.
const MISS_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400";

interface ResolvedIcon {
  body: ArrayBuffer;
  contentType: string;
}

function edgeCache(): Cache | null {
  try {
    const store = (globalThis as { caches?: { default?: Cache } }).caches;
    return store?.default ?? null;
  } catch {
    return null;
  }
}

/**
 * Runs cache bookkeeping without holding up the response. Takes a factory so a
 * synchronous throw from the Cache API cannot escape into the handler.
 */
function runAfterResponse(work: () => Promise<unknown>): void {
  let settled: Promise<unknown>;
  try {
    settled = work().catch(() => undefined);
  } catch {
    return;
  }
  try {
    getCloudflareContext().ctx.waitUntil(settled);
  } catch {
    // Local `next dev` has no Cloudflare execution context; the promise still
    // settles on its own.
    void settled;
  }
}

async function downloadIcon(url: string): Promise<ResolvedIcon | null> {
  try {
    const response = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(ICON_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ICON_BYTES) {
      return null;
    }

    const body = await response.arrayBuffer();
    const contentType = sniffIconContentType(new Uint8Array(body));
    if (!contentType) return null;

    return { body, contentType };
  } catch {
    return null;
  }
}

/** Icon URLs declared by the site itself, which are the highest quality. */
async function declaredIconUrls(domain: string): Promise<string[]> {
  const pageUrl = `https://${domain}/`;
  try {
    const response = await fetch(pageUrl, {
      headers: {
        "user-agent": FETCH_HEADERS["user-agent"],
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(MARKUP_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("html")) return [];

    const markup = (await response.text()).slice(0, MAX_MARKUP_BYTES);
    // Redirects are followed, so links resolve against the final URL.
    return extractIconHrefs(markup, response.url || pageUrl);
  } catch {
    return [];
  }
}

async function resolveIcon(domain: string): Promise<ResolvedIcon | null> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const attempted = new Set<string>();

  const fallbacks = fallbackIconUrls(domain);
  // DuckDuckGo answers fast and covers most domains; the site's own markup is
  // consulted next because it is the authoritative, sharpest source.
  const first = fallbacks.slice(0, 1);
  const rest = fallbacks.slice(1);

  for (const url of first) {
    attempted.add(url);
    const icon = await downloadIcon(url);
    if (icon) return icon;
  }

  if (Date.now() < deadline) {
    for (const url of await declaredIconUrls(domain)) {
      if (Date.now() > deadline || attempted.has(url)) continue;
      attempted.add(url);
      const icon = await downloadIcon(url);
      if (icon) return icon;
    }
  }

  for (const url of rest) {
    if (Date.now() > deadline || attempted.has(url)) continue;
    attempted.add(url);
    const icon = await downloadIcon(url);
    if (icon) return icon;
  }

  return null;
}

function iconResponse(icon: ResolvedIcon): Response {
  return new Response(icon.body, {
    status: 200,
    headers: {
      "content-type": icon.contentType,
      "cache-control": SUCCESS_CACHE_CONTROL,
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}

function missResponse(): Response {
  // A miss is a 404 so the client falls back to its own branded letter tile.
  return new Response(null, {
    status: 404,
    headers: { "cache-control": MISS_CACHE_CONTROL },
  });
}

export async function GET(request: Request): Promise<Response> {
  const domain = normalizeWebDomain(
    new URL(request.url).searchParams.get("domain") ?? "",
  );
  if (!isProxyableIconDomain(domain)) {
    return new Response(null, {
      status: 400,
      headers: { "cache-control": "public, max-age=86400" },
    });
  }

  // A synthetic key keeps cache hits stable regardless of how the query string
  // was written by the caller.
  const cache = edgeCache();
  const cacheKey = new Request(`https://site-icon.appclimb.app/${domain}`);
  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => undefined);
    if (hit) return hit;
  }

  const icon = await resolveIcon(domain);
  const response = icon ? iconResponse(icon) : missResponse();
  if (cache) {
    runAfterResponse(() => cache.put(cacheKey, response.clone()));
  }
  return response;
}
