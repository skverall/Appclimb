import { NextRequest } from "next/server";

import { canonicalResource, exchangeAuthorizationCode, refreshAccessToken } from "@/lib/agent-auth";
import { agentJson, clientIdFrom, corsPreflight, oauthError, readParams } from "@/lib/agent-server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OAuth 2.1 token endpoint: authorization_code (PKCE) and refresh_token grants. */
export async function POST(request: NextRequest) {
  const db = getDb();
  if (!db) return oauthError("temporarily_unavailable", "Accounts are not configured.", 503);
  const params = await readParams(request);
  const clientId = clientIdFrom(request, params);
  const grantType = params.get("grant_type");

  if (grantType === "authorization_code") {
    if (!clientId) return oauthError("invalid_client", "client_id is required.", 401);
    const rawResource = params.get("resource");
    const resource = rawResource ? canonicalResource(rawResource, request.nextUrl.origin) : null;
    if (rawResource && !resource) return oauthError("invalid_target", "Unknown resource.");
    const result = await exchangeAuthorizationCode(db, {
      code: params.get("code") ?? "",
      clientId,
      redirectUri: params.get("redirect_uri") ?? "",
      codeVerifier: params.get("code_verifier") ?? "",
      resource,
    });
    return result.ok ? agentJson(result.tokens) : oauthError(result.error, result.description);
  }

  if (grantType === "refresh_token") {
    const result = await refreshAccessToken(db, {
      refreshToken: params.get("refresh_token") ?? "",
      clientId,
    });
    return result.ok ? agentJson(result.tokens) : oauthError(result.error, result.description);
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export function OPTIONS() {
  return corsPreflight();
}
