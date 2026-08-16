/**
 * Server-only access to the D1 binding (`DB`) provided by the OpenNext
 * Cloudflare Worker. See ADR 0004 and wrangler.jsonc.
 *
 * Returns `null` when no Cloudflare context is available (e.g. `next start`
 * in e2e, or a local dev server without the platform proxy). Callers must
 * treat that as "backend not configured" and degrade gracefully — the same
 * pattern `POST /api/popularity` uses for missing Apple Ads credentials.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getDb(): D1Database | null {
  try {
    const { env } = getCloudflareContext();
    return env.DB ?? null;
  } catch {
    return null;
  }
}

/** ISO-8601 UTC timestamp for "now", matching D1 `datetime('now')` semantics. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** ISO-8601 UTC timestamp `ms` milliseconds from now. */
export function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}
