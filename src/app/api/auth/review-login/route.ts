import { NextRequest, NextResponse } from "next/server";

import { createSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { clientIpFromHeaders, createRateLimiter } from "@/lib/rate-limit";
import { readReviewLoginConfig, reviewSignIn } from "@/lib/review-login";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One known account with a long random password: a few tries per IP is plenty.
const limiter = createRateLimiter({
  maxPerWindow: 10,
  windowMs: 15 * 60 * 1000, // 10 attempts / 15 minutes / IP
  minIntervalMs: 1_000,
});

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/** Password sign-in for the app-directory reviewer account only (src/lib/review-login.ts). */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return jsonError(403, "Cross-site request refused.");

  const config = readReviewLoginConfig();
  if (!config) return jsonError(404, "Not found.");
  const db = getDb();
  if (!db) return jsonError(503, "Accounts are not configured yet.");

  const ip = clientIpFromHeaders((name) => request.headers.get(name));
  const rate = limiter.consume(ip);
  if (!rate.ok) {
    return jsonError(429, "Too many attempts. Try again later.", { retryAfterSec: rate.retryAfterSec });
  }

  let body: { email?: unknown; password?: unknown; next?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  const user = await reviewSignIn(db, config, email, password);
  if (!user) return jsonError(401, "Wrong email or password.");

  const { token } = await createSession(db, user.id);
  const next = safeRedirectPath(typeof body.next === "string" ? body.next : null);
  const response = NextResponse.json({ ok: true, next });
  setSessionCookie(response, token, request);
  return response;
}
