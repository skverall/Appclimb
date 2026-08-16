import { NextRequest, NextResponse } from "next/server";

import { createSession, upsertUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  googleCallbackUrl,
  OAUTH_STATE_COOKIE,
  readGoogleCredentials,
} from "@/lib/google";
import { setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(request: NextRequest, reason: string): NextResponse {
  return NextResponse.redirect(new URL(`/?auth=${reason}`, request.nextUrl.origin));
}

export async function GET(request: NextRequest) {
  const db = getDb();
  if (!db) return fail(request, "unavailable");

  const creds = readGoogleCredentials();
  if (!creds) return fail(request, "unavailable");

  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state") ?? "";
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? "";

  // The cookie carries "state" or "state:/next". Compare the state prefix.
  const cookieStatePart = cookieState.split(":")[0];
  const nextPart = cookieState.includes(":") ? cookieState.slice(cookieState.indexOf(":") + 1) : "/";
  if (!code || !returnedState || !cookieStatePart || returnedState !== cookieStatePart) {
    return fail(request, "invalid");
  }
  const next = nextPart.startsWith("/") && !nextPart.startsWith("//") ? nextPart : "/";

  const tokens = await exchangeCodeForTokens({
    creds,
    code,
    redirectUri: googleCallbackUrl(request.nextUrl.origin),
  });
  if (!tokens || tokens.error || !tokens.access_token) {
    return fail(request, "invalid");
  }

  const info = await fetchGoogleUserInfo(tokens.access_token);
  if (!info) return fail(request, "invalid");

  const user = await upsertUser(db, {
    email: info.email,
    name: info.name,
    googleSub: info.sub,
    emailVerified: info.email_verified,
  });
  const { token: sessionToken } = await createSession(db, user.id);

  const redirectUrl = new URL(next, request.nextUrl.origin);
  redirectUrl.searchParams.set("auth", "ok");
  const response = NextResponse.redirect(redirectUrl);
  setSessionCookie(response, sessionToken, request);
  // Clear the one-time CSRF state cookie.
  response.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
