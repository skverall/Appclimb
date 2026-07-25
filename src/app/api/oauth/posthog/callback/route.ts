import { redirect } from "next/navigation";

import {
  clearPostHogOAuthStart,
  POSTHOG_CLIENT_ID,
  POSTHOG_REDIRECT_URI,
  readPostHogOAuthStart,
  resolvePostHogHost,
  setPostHogOAuthPending,
} from "@/lib/posthog-oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const providerError = url.searchParams.get("error");
  const started = await readPostHogOAuthStart();
  await clearPostHogOAuthStart();

  if (
    providerError ||
    !code ||
    !state ||
    !started ||
    state !== started.state ||
    Date.now() - started.createdAt > 10 * 60 * 1000
  ) {
    redirect("/?view=sources&source=posthog&oauth=error");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: POSTHOG_CLIENT_ID,
    redirect_uri: POSTHOG_REDIRECT_URI,
    code_verifier: started.verifier,
  });
  const response = await fetch("https://oauth.posthog.com/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    redirect("/?view=sources&source=posthog&oauth=error");
  }
  const token = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!token.access_token || !token.refresh_token) {
    redirect("/?view=sources&source=posthog&oauth=error");
  }
  const host = await resolvePostHogHost(token.access_token);
  if (!host) {
    redirect("/?view=sources&source=posthog&oauth=error");
  }
  await setPostHogOAuthPending({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(
      Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000,
    ).toISOString(),
    host,
    scope: token.scope ?? "",
  });
  redirect("/?view=sources&source=posthog&oauth=ready");
}
