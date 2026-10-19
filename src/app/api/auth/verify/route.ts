import { NextRequest, NextResponse } from "next/server";

import { consumeMagicLink, createSession, upsertUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.redirect(new URL("/?auth=unavailable", request.nextUrl.origin));
  }

  const token = request.nextUrl.searchParams.get("token") ?? "";
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"));

  const email = await consumeMagicLink(db, token);
  if (!email) {
    return NextResponse.redirect(new URL("/?auth=invalid", request.nextUrl.origin));
  }

  const user = await upsertUser(db, { email, emailVerified: true });
  const { token: sessionToken } = await createSession(db, user.id);

  const redirectUrl = new URL(next, request.nextUrl.origin);
  redirectUrl.searchParams.set("auth", "ok");
  const response = NextResponse.redirect(redirectUrl);
  setSessionCookie(response, sessionToken, request);
  return response;
}
