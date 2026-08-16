import { NextRequest, NextResponse } from "next/server";

import { createMagicLink, isValidEmail, normalizeEmail } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildMagicLinkEmail, readResendCredentials, sendEmail } from "@/lib/email";
import { clientIpFromHeaders, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Magic-link emails are expensive and abusable; keep a tight per-IP cap.
const limiter = createRateLimiter({
  maxPerWindow: 5,
  windowMs: 60 * 60 * 1000, // 5 emails / hour / IP
  minIntervalMs: 10_000,
});

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  const db = getDb();
  if (!db) return jsonError(503, "Accounts are not configured yet.", { configured: false });

  const resend = readResendCredentials();
  if (!resend) return jsonError(503, "Email is not configured yet.", { configured: false });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }
  const email = typeof (body as { email?: unknown }).email === "string" ? (body as { email: string }).email : "";
  if (!isValidEmail(email)) return jsonError(400, "Enter a valid email address.");

  const ip = clientIpFromHeaders((name) => request.headers.get(name));
  const rate = limiter.consume(ip);
  if (!rate.ok) {
    return jsonError(429, "Too many sign-in emails. Try again later.", {
      retryAfterSec: rate.retryAfterSec,
    });
  }

  const normalized = normalizeEmail(email);
  const { token } = await createMagicLink(db, normalized);
  const url = `${request.nextUrl.origin}/api/auth/verify?token=${encodeURIComponent(token)}`;
  const message = buildMagicLinkEmail(url);

  const sent = await sendEmail(resend, { to: normalized, ...message });
  if (!sent.ok) {
    return jsonError(502, "Could not send the sign-in email. Try again in a moment.");
  }

  // Do not reveal whether the email already has an account.
  return NextResponse.json({ ok: true, email: normalized });
}
