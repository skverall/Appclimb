import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { requestWithSession } from "@/lib/backend";
import {
  POSTHOG_CLIENT_ID,
  POSTHOG_OAUTH_SCOPES,
  POSTHOG_REDIRECT_URI,
  redirectWithPostHogOAuthStart,
} from "@/lib/posthog-oauth";

export async function GET(request: Request) {
  const identity = await requestWithSession("/v1/me");
  if (!identity?.ok) {
    return NextResponse.redirect(new URL("/login", request.url), 302);
  }

  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");

  const authorize = new URL("https://oauth.posthog.com/oauth/authorize/");
  authorize.searchParams.set("client_id", POSTHOG_CLIENT_ID);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", POSTHOG_REDIRECT_URI);
  authorize.searchParams.set("scope", POSTHOG_OAUTH_SCOPES);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  return redirectWithPostHogOAuthStart(authorize.toString(), {
    state,
    verifier,
    createdAt: Date.now(),
  });
}
