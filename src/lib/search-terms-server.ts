// Server-only wiring for the search-term store: credentials, D1, and the
// small request helpers shared by /api/popularity and /api/terms/*.

import { NextResponse } from "next/server";

import { readAppleAdsCredentials } from "@/lib/apple-ads";
import { SUPPORTED_COUNTRIES } from "@/lib/aso";
import { getDb } from "@/lib/db";
import { clientIpFromHeaders, createRateLimiter } from "@/lib/rate-limit";
import type { StoreDeps } from "@/lib/search-terms-store";

const supported = new Set(SUPPORTED_COUNTRIES.map((item) => item.code));

export function searchTermDeps(): StoreDeps | null {
  const creds = readAppleAdsCredentials();
  if (!creds) return null;
  return { creds, db: getDb() };
}

export function parseCountry(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const country = raw.trim().toUpperCase();
  return supported.has(country) ? country : null;
}

const termsLimiter = createRateLimiter({
  maxPerWindow: 240,
  windowMs: 60_000,
  minIntervalMs: 0,
});

/** Per-IP guard for the public GET term endpoints. */
export function termsRateLimited(request: Request): NextResponse | null {
  const ip = clientIpFromHeaders((name) => request.headers.get(name));
  const result = termsLimiter.consume(`ip:${ip}`);
  if (result.ok) return null;
  return NextResponse.json(
    { error: "Too many requests. Slow down a little." },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSec ?? 5) },
    },
  );
}

/** Apple publishes weekly, so these answers are safe to cache for an hour. */
export const TERMS_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=900, s-maxage=3600",
};

export function notConfigured(): NextResponse {
  return NextResponse.json({ configured: false });
}

export function upstreamError(error: unknown): NextResponse {
  // Visible in Workers observability; never sent to the client.
  console.error(
    "[search-terms] upstream failure:",
    error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  );
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 429
      ? 429
      : 502;
  return NextResponse.json(
    {
      configured: true,
      error:
        status === 429
          ? "Apple Ads is rate-limiting requests. Try again in a minute."
          : "Could not reach Apple Ads. Try again in a moment.",
    },
    { status },
  );
}
