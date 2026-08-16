import { NextRequest, NextResponse } from "next/server";

import {
  AppleAdsError,
  lookupSearchTermPopularity,
  readAppleAdsCredentials,
} from "@/lib/apple-ads";
import { isAppleAdsGenre, mapItunesGenre } from "@/lib/apple-ads-genres";
import { SUPPORTED_COUNTRIES } from "@/lib/aso";
import type { OfficialPopularity } from "@/lib/popularity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 25;
const MAX_TERM_CHARS = 80;
const MAX_PER_HOUR = 80;
const MAX_PER_DAY = 300;
const MIN_INTERVAL_MS = 80;

interface RateBucket {
  hourCount: number;
  hourReset: number;
  dayCount: number;
  dayReset: number;
  lastAt: number;
}

const rateBuckets = new Map<string, RateBucket>();
const supported = new Set(SUPPORTED_COUNTRIES.map((item) => item.code));

function getClientIp(request: NextRequest): string {
  const forwarded =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return forwarded.slice(0, 64);
}

function emptyBucket(now: number): RateBucket {
  return {
    hourCount: 0,
    hourReset: now + 60 * 60 * 1000,
    dayCount: 0,
    dayReset: now + 24 * 60 * 60 * 1000,
    lastAt: 0,
  };
}

function consumeRate(bucket: RateBucket, now: number): {
  ok: boolean;
  reason?: string;
  retryAfterSec?: number;
  bucket: RateBucket;
} {
  const next = { ...bucket };
  if (now >= next.hourReset) {
    next.hourCount = 0;
    next.hourReset = now + 60 * 60 * 1000;
  }
  if (now >= next.dayReset) {
    next.dayCount = 0;
    next.dayReset = now + 24 * 60 * 60 * 1000;
  }
  if (now - next.lastAt < MIN_INTERVAL_MS) {
    return {
      ok: false,
      reason: "Too many popularity lookups. Wait a moment.",
      retryAfterSec: 1,
      bucket: next,
    };
  }
  if (next.hourCount >= MAX_PER_HOUR) {
    return {
      ok: false,
      reason: "Hourly popularity lookup limit reached.",
      retryAfterSec: Math.max(1, Math.ceil((next.hourReset - now) / 1000)),
      bucket: next,
    };
  }
  if (next.dayCount >= MAX_PER_DAY) {
    return {
      ok: false,
      reason: "Daily popularity lookup limit reached.",
      retryAfterSec: Math.max(1, Math.ceil((next.dayReset - now) / 1000)),
      bucket: next,
    };
  }
  next.hourCount += 1;
  next.dayCount += 1;
  next.lastAt = now;
  return { ok: true, bucket: next };
}

function jsonError(
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json({ error, configured: status !== 503, ...extra }, { status });
}

interface LookupItem {
  term: string;
  genre: string;
}

function parseItems(raw: unknown): LookupItem[] {
  if (!Array.isArray(raw)) return [];
  const items: LookupItem[] = [];
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== "object") continue;
    const term =
      typeof (entry as { term?: unknown }).term === "string"
        ? (entry as { term: string }).term.trim()
        : "";
    const genreRaw =
      typeof (entry as { genre?: unknown }).genre === "string"
        ? (entry as { genre: string }).genre.trim()
        : "";
    if (!term || term.length > MAX_TERM_CHARS) continue;
    const genre = mapItunesGenre(genreRaw);
    if (!genre || !isAppleAdsGenre(genre)) continue;
    items.push({ term, genre });
  }
  return items;
}

export async function POST(request: NextRequest) {
  const creds = readAppleAdsCredentials();
  if (!creds) {
    return NextResponse.json({
      configured: false,
      results: [],
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const payload = body as { country?: unknown; items?: unknown };
  const country =
    typeof payload.country === "string"
      ? payload.country.trim().toUpperCase()
      : "";
  if (!supported.has(country)) {
    return jsonError(400, "Unsupported storefront.");
  }
  const items = parseItems(payload.items);
  if (items.length === 0) {
    return jsonError(400, "At least one valid term + genre is required.");
  }

  const now = Date.now();
  const ip = getClientIp(request);
  const existing = rateBuckets.get(ip) ?? emptyBucket(now);
  const rate = consumeRate(existing, now);
  rateBuckets.set(ip, rate.bucket);
  if (rateBuckets.size > 5_000) {
    const first = rateBuckets.keys().next().value;
    if (first) rateBuckets.delete(first);
  }
  if (!rate.ok) {
    return jsonError(429, rate.reason ?? "Rate limited.", {
      retryAfterSec: rate.retryAfterSec,
    });
  }

  const byGenre = new Map<string, string[]>();
  for (const item of items) {
    const list = byGenre.get(item.genre) ?? [];
    list.push(item.term);
    byGenre.set(item.genre, list);
  }

  const results: OfficialPopularity[] = [];
  try {
    for (const [genre, terms] of byGenre) {
      const found = await lookupSearchTermPopularity(creds, {
        country,
        genre,
        terms,
      });
      results.push(...found);
    }
  } catch (error) {
    if (error instanceof AppleAdsError) {
      return jsonError(error.status, error.message);
    }
    return jsonError(502, "Could not reach Apple Ads. Try again in a moment.");
  }

  const foundKeys = new Set(results.map((row) => row.term.toLocaleLowerCase()));
  for (const item of items) {
    if (!foundKeys.has(item.term.toLocaleLowerCase())) {
      results.push({ term: item.term, found: false, genre: item.genre });
    }
  }

  return NextResponse.json({
    configured: true,
    country,
    results,
  });
}
