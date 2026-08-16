/**
 * Best-effort in-memory rate limiter for Worker route handlers.
 *
 * Like the existing limiters in `/api/chat` and `/api/popularity`, state is
 * per-isolate and not shared across Cloudflare isolates, so this is a
 * deterrent rather than a hard guarantee. It is paired with client-side caps
 * and per-user quotas enforced from the entitlements store.
 */

export interface RateLimitConfig {
  /** Maximum allowed events within the rolling window. */
  maxPerWindow: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Minimum spacing between events in milliseconds. */
  minIntervalMs?: number;
  /** Maximum number of tracked keys before evicting the oldest. */
  maxKeys?: number;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec?: number;
  remaining: number;
}

interface Bucket {
  count: number;
  windowReset: number;
  lastAt: number;
}

export interface RateLimiter {
  consume(key: string, now?: number): RateLimitResult;
}

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const maxKeys = config.maxKeys ?? 5_000;
  const minIntervalMs = config.minIntervalMs ?? 0;

  return {
    consume(key: string, now: number = Date.now()): RateLimitResult {
      let bucket = buckets.get(key);
      if (!bucket || now >= bucket.windowReset) {
        bucket = { count: 0, windowReset: now + config.windowMs, lastAt: 0 };
      }
      const next: Bucket = { ...bucket };

      if (minIntervalMs > 0 && now - next.lastAt < minIntervalMs) {
        buckets.set(key, next);
        return { ok: false, retryAfterSec: 1, remaining: 0 };
      }
      if (next.count >= config.maxPerWindow) {
        buckets.set(key, next);
        return {
          ok: false,
          retryAfterSec: Math.max(1, Math.ceil((next.windowReset - now) / 1000)),
          remaining: 0,
        };
      }

      next.count += 1;
      next.lastAt = now;
      buckets.set(key, next);
      if (buckets.size > maxKeys) {
        const oldest = buckets.keys().next().value;
        if (oldest) buckets.delete(oldest);
      }
      return { ok: true, remaining: config.maxPerWindow - next.count };
    },
  };
}

/** Extract a best-effort client identifier (IP) from common proxy headers. */
export function clientIpFromHeaders(get: (name: string) => string | null): string {
  const ip =
    get("cf-connecting-ip") ||
    get("x-forwarded-for")?.split(",")[0]?.trim() ||
    get("x-real-ip") ||
    "unknown";
  return ip.slice(0, 64);
}
