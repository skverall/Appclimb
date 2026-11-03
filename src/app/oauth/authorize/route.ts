import { NextRequest, NextResponse } from "next/server";

import {
  AGENT_SCOPE,
  canonicalResource,
  clientRedirect,
  isValidCodeChallenge,
  redirectUriMatches,
  resolveClient,
  saveAuthorizationRequest,
} from "@/lib/agent-auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Problems that make the redirect URI untrustworthy are shown on our own page. */
function showError(request: NextRequest, code: string): NextResponse {
  const url = new URL("/oauth/consent", request.nextUrl.origin);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

/**
 * OAuth 2.1 authorization endpoint. Validates the client and PKCE request,
 * parks it in D1, and sends the user to the consent page, which handles
 * sign-in when needed.
 */
export async function GET(request: NextRequest) {
  const db = getDb();
  if (!db) return showError(request, "unavailable");
  const query = request.nextUrl.searchParams;
  const origin = request.nextUrl.origin;

  const client = await resolveClient(db, query.get("client_id") ?? "");
  if (!client) return showError(request, "unknown_client");

  const requestedRedirect = query.get("redirect_uri") ?? "";
  const redirectUri =
    requestedRedirect || (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (!redirectUri || !redirectUriMatches(client.redirectUris, redirectUri)) {
    return showError(request, "bad_redirect");
  }

  const state = query.get("state");
  const back = (error: string, description: string) =>
    NextResponse.redirect(clientRedirect({ redirectUri, state }, { error, error_description: description }, origin));

  if (query.get("response_type") !== "code") {
    return back("unsupported_response_type", "Only response_type=code is supported.");
  }
  const challenge = query.get("code_challenge");
  if (!isValidCodeChallenge(challenge) || (query.get("code_challenge_method") ?? "") !== "S256") {
    return back("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  const resource = canonicalResource(query.get("resource"), origin);
  if (!resource) return back("invalid_target", `resource must be ${origin}/mcp.`);

  const id = await saveAuthorizationRequest(db, {
    clientId: client.clientId,
    redirectUri,
    state: state ? state.slice(0, 512) : null,
    codeChallenge: challenge,
    scope: AGENT_SCOPE,
    resource,
  });
  const consent = new URL("/oauth/consent", origin);
  consent.searchParams.set("request", id);
  return NextResponse.redirect(consent);
}
