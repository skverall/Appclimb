import { describe, expect, it } from "vitest";

import { clientIpFromHeaders, createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  const now = 1_000_000_000_000;

  it("allows up to the window limit then rejects", () => {
    const limiter = createRateLimiter({ maxPerWindow: 3, windowMs: 60_000 });
    expect(limiter.consume("a", now).ok).toBe(true);
    expect(limiter.consume("a", now + 1).ok).toBe(true);
    expect(limiter.consume("a", now + 2).ok).toBe(true);
    const denied = limiter.consume("a", now + 3);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ maxPerWindow: 1, windowMs: 60_000 });
    expect(limiter.consume("a", now).ok).toBe(true);
    expect(limiter.consume("b", now).ok).toBe(true);
    expect(limiter.consume("a", now + 1).ok).toBe(false);
  });

  it("resets after the window elapses", () => {
    const limiter = createRateLimiter({ maxPerWindow: 1, windowMs: 60_000 });
    expect(limiter.consume("a", now).ok).toBe(true);
    expect(limiter.consume("a", now + 1).ok).toBe(false);
    expect(limiter.consume("a", now + 61_000).ok).toBe(true);
  });

  it("enforces a minimum interval between events", () => {
    const limiter = createRateLimiter({ maxPerWindow: 10, windowMs: 60_000, minIntervalMs: 5_000 });
    expect(limiter.consume("a", now).ok).toBe(true);
    expect(limiter.consume("a", now + 1_000).ok).toBe(false);
    expect(limiter.consume("a", now + 6_000).ok).toBe(true);
  });

  it("reports remaining capacity", () => {
    const limiter = createRateLimiter({ maxPerWindow: 2, windowMs: 60_000 });
    expect(limiter.consume("a", now).remaining).toBe(1);
    expect(limiter.consume("a", now + 1).remaining).toBe(0);
  });

  it("evicts the oldest key beyond maxKeys", () => {
    const limiter = createRateLimiter({ maxPerWindow: 5, windowMs: 60_000, maxKeys: 2 });
    limiter.consume("a", now);
    limiter.consume("b", now);
    limiter.consume("c", now); // evicts "a"
    // "a" was evicted, so it starts fresh with full capacity.
    expect(limiter.consume("a", now + 1).remaining).toBe(4);
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers cf-connecting-ip", () => {
    const headers: Record<string, string> = {
      "cf-connecting-ip": "1.2.3.4",
      "x-forwarded-for": "5.6.7.8, 9.9.9.9",
    };
    expect(clientIpFromHeaders((name) => headers[name] ?? null)).toBe("1.2.3.4");
  });

  it("falls back to the first x-forwarded-for entry", () => {
    const headers: Record<string, string> = { "x-forwarded-for": " 5.6.7.8 , 9.9.9.9" };
    expect(clientIpFromHeaders((name) => headers[name] ?? null)).toBe("5.6.7.8");
  });

  it("uses x-real-ip then unknown", () => {
    expect(clientIpFromHeaders((name) => (name === "x-real-ip" ? "7.7.7.7" : null))).toBe("7.7.7.7");
    expect(clientIpFromHeaders(() => null)).toBe("unknown");
  });

  it("truncates very long values", () => {
    const long = "9".repeat(200);
    expect(clientIpFromHeaders((name) => (name === "x-real-ip" ? long : null)).length).toBe(64);
  });
});
