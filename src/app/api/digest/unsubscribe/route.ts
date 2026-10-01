import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { verifyUnsubscribeToken, writeDigestEnabled } from "@/lib/digest-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stop the weekly email without signing in. Serves both the mail client's
 * one-click unsubscribe (RFC 8058, POST with the token in the URL) and the
 * confirmation form on /unsubscribe.
 */
/** Same-origin relative redirect (the CSP's form-action also covers redirects). */
function backTo(query: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: `/unsubscribe?${query}` } });
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const secret = process.env.DIGEST_SECRET?.trim() ?? "";
  let userId = request.nextUrl.searchParams.get("u") ?? "";
  let token = request.nextUrl.searchParams.get("t") ?? "";
  const isForm = (request.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded");
  const form = isForm ? await request.formData().catch(() => null) : null;
  // Mail clients post "List-Unsubscribe=One-Click" and keep the token in the URL;
  // the confirmation page posts u and t as fields and expects a page back.
  const fromPage = form !== null && form.get("List-Unsubscribe") === null;
  if (fromPage) {
    userId = String(form.get("u") ?? userId);
    token = String(form.get("t") ?? token);
  }
  if (!db || !(await verifyUnsubscribeToken(secret, userId, token))) {
    return fromPage ? backTo("error=1") : NextResponse.json({ error: "Invalid unsubscribe link." }, { status: 400 });
  }
  await writeDigestEnabled(db, userId, false);
  return fromPage ? backTo("done=1") : new NextResponse("Unsubscribed.", { status: 200 });
}
