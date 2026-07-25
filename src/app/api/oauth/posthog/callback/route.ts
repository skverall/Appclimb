import {
  POSTHOG_CLIENT_ID,
  POSTHOG_REDIRECT_URI,
  parsePostHogOAuthToken,
  postHogOAuthErrorRedirect,
  postHogOAuthReadyRedirect,
  readPostHogOAuthStart,
  resolvePostHogHost,
} from "@/lib/posthog-oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const providerError = url.searchParams.get("error");
  const started = await readPostHogOAuthStart();

  if (providerError) {
    return postHogOAuthErrorRedirect("provider_denied");
  }
  if (!code) {
    return postHogOAuthErrorRedirect("missing_code");
  }
  if (!state) {
    return postHogOAuthErrorRedirect("missing_state");
  }
  if (!started) {
    // Most common failure: OAuth started on www/localhost, or start cookie was
    // dropped before the browser returned from PostHog.
    return postHogOAuthErrorRedirect("missing_start");
  }
  if (state !== started.state) {
    return postHogOAuthErrorRedirect("state_mismatch");
  }
  if (Date.now() - started.createdAt > 10 * 60 * 1000) {
    return postHogOAuthErrorRedirect("start_expired");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: POSTHOG_CLIENT_ID,
    redirect_uri: POSTHOG_REDIRECT_URI,
    code_verifier: started.verifier,
  });

  let response: Response;
  try {
    response = await fetch("https://oauth.posthog.com/oauth/token/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return postHogOAuthErrorRedirect("token_exchange");
  }

  if (!response.ok) {
    return postHogOAuthErrorRedirect("token_exchange");
  }

  let tokenPayload: unknown;
  try {
    tokenPayload = await response.json();
  } catch {
    return postHogOAuthErrorRedirect("token_incomplete");
  }
  const token = parsePostHogOAuthToken(tokenPayload);
  if (!token) {
    return postHogOAuthErrorRedirect("token_incomplete");
  }

  const host = await resolvePostHogHost(token.accessToken);
  if (!host) {
    return postHogOAuthErrorRedirect("host_unresolved");
  }

  return postHogOAuthReadyRedirect({
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
    host,
    scope: token.scope,
  });
}
