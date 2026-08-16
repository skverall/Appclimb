/**
 * Server-only Google OAuth (OpenID Connect) helpers for sign-in (ADR 0004).
 * Uses the authorization-code flow. Degrades gracefully when Google
 * credentials are not configured.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_SCOPE = "openid email profile";
const TOKEN_TIMEOUT_MS = 15_000;

export const OAUTH_STATE_COOKIE = "appclimb_oauth_state";
export const OAUTH_STATE_TTL_SEC = 10 * 60; // 10 minutes

export function googleCallbackUrl(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

export function readGoogleCredentials(): GoogleCredentials | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function buildGoogleAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPE);
  url.searchParams.set("state", input.state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export async function exchangeCodeForTokens(input: {
  creds: GoogleCredentials;
  code: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  try {
    const body = new URLSearchParams({
      code: input.code,
      client_id: input.creds.clientId,
      client_secret: input.creds.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    });
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    const data = (await res.json()) as GoogleTokenResponse;
    if (!res.ok) return { error: data.error ?? "token_error", error_description: data.error_description };
    return data;
  } catch {
    return { error: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string | null;
  picture: string | null;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<GoogleUserInfo> & { name?: string; picture?: string };
    if (!data.sub || !data.email) return null;
    return {
      sub: data.sub,
      email: data.email,
      email_verified: data.email_verified === true,
      name: typeof data.name === "string" ? data.name : null,
      picture: typeof data.picture === "string" ? data.picture : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
