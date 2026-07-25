import "server-only";

import { cookies } from "next/headers";

const ACCESS_COOKIE = "appclimb_access";
const REFRESH_COOKIE = "appclimb_refresh";
const API_URL = (
  process.env.APPCLIMB_API_URL ??
  "https://appclimb.srv1300823.hstgr.cloud"
).replace(/\/$/, "");

export interface BackendIdentity {
  userId: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  trialEndsAt: string;
  subscriptionStatus: string;
}

export interface BackendTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

interface AuthEnvelope {
  data?: {
    identity?: BackendIdentity;
    tokens?: BackendTokens;
  };
}

export type BackendSessionRefreshResult =
  | "refreshed"
  | "missing"
  | "invalid"
  | "unavailable";

function cookieOptions(expiresAt: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expiresAt),
  };
}

export async function setBackendSession(tokens: BackendTokens) {
  const store = await cookies();
  store.set(
    ACCESS_COOKIE,
    tokens.accessToken,
    cookieOptions(tokens.accessTokenExpiresAt),
  );
  store.set(
    REFRESH_COOKIE,
    tokens.refreshToken,
    cookieOptions(tokens.refreshTokenExpiresAt),
  );
}

export async function clearBackendSession() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function backendSessionPresence() {
  const store = await cookies();
  return {
    hasAccessToken: Boolean(store.get(ACCESS_COOKIE)?.value),
    hasRefreshToken: Boolean(store.get(REFRESH_COOKIE)?.value),
  };
}

export async function backendRequest(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(12_000),
  });
}

export async function readBackend(path: string, init: RequestInit = {}) {
  const accessToken = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return null;
  }
  return backendRequest(path, init, accessToken);
}

export async function requestWithSession(
  path: string,
  init: RequestInit = {},
) {
  const store = await cookies();
  let accessToken = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return null;
  }

  const response = accessToken
    ? await backendRequest(path, init, accessToken)
    : undefined;
  if (response && (response.status !== 401 || !refreshToken)) {
    return response;
  }

  const refreshResult = await refreshBackendSession();
  if (refreshResult !== "refreshed") {
    return response ?? null;
  }

  accessToken = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return response ?? null;
  }
  return backendRequest(path, init, accessToken);
}

export async function refreshBackendSession(): Promise<BackendSessionRefreshResult> {
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return "missing";
  }

  let refreshResponse: Response;
  try {
    refreshResponse = await backendRequest("/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    return "unavailable";
  }
  if (!refreshResponse.ok) {
    await clearBackendSession();
    return "invalid";
  }

  let refreshed: AuthEnvelope;
  try {
    refreshed = (await refreshResponse.json()) as AuthEnvelope;
  } catch {
    await clearBackendSession();
    return "invalid";
  }
  const tokens = refreshed.data?.tokens;
  if (!tokens) {
    await clearBackendSession();
    return "invalid";
  }
  await setBackendSession(tokens);
  return "refreshed";
}

export async function createSessionFromResponse(response: Response) {
  const payload = (await response.json()) as AuthEnvelope;
  const tokens = payload.data?.tokens;
  const identity = payload.data?.identity;
  if (!response.ok || !tokens || !identity) {
    return null;
  }
  await setBackendSession(tokens);
  return identity;
}

export async function getRefreshToken() {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}

export function backendPublicUrl(path: string) {
  return `${API_URL}${path}`;
}

export async function relayBackendResponse(response: Response) {
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers,
  });
}
