import { NextRequest, NextResponse } from "next/server";

import { generateToken } from "@/lib/auth";
import {
  buildGoogleAuthUrl,
  googleCallbackUrl,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SEC,
  readGoogleCredentials,
} from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const creds = readGoogleCredentials();
  if (!creds) {
    return NextResponse.redirect(new URL("/?auth=unavailable", request.nextUrl.origin));
  }

  const state = generateToken(24);
  const next = request.nextUrl.searchParams.get("next");
  // Persist the requested post-login destination alongside the CSRF state.
  const stateValue = next && next.startsWith("/") && !next.startsWith("//") ? `${state}:${next}` : state;

  const authUrl = buildGoogleAuthUrl({
    clientId: creds.clientId,
    redirectUri: googleCallbackUrl(request.nextUrl.origin),
    state: stateValue,
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, stateValue, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_TTL_SEC,
  });
  return response;
}
