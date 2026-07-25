import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/** Canonical public origin for CIMD client_id + redirect_uri (must stay stable). */
export const POSTHOG_PUBLIC_ORIGIN = "https://appclimb.app";

export const POSTHOG_CLIENT_ID = `${POSTHOG_PUBLIC_ORIGIN}/api/oauth/posthog/client`;
export const POSTHOG_REDIRECT_URI = `${POSTHOG_PUBLIC_ORIGIN}/api/oauth/posthog/callback`;
export const POSTHOG_OAUTH_SCOPES =
  "organization:read project:read query:read";

const START_COOKIE = "appclimb_posthog_oauth_start";
const PENDING_COOKIE = "appclimb_posthog_oauth_pending";

/** Keep OAuth cookies available to every /api/oauth/posthog/* handler. */
const OAUTH_COOKIE_PATH = "/api/oauth/posthog";

export type PostHogOAuthErrorReason =
  | "provider_denied"
  | "missing_code"
  | "missing_state"
  | "missing_start"
  | "state_mismatch"
  | "start_expired"
  | "token_exchange"
  | "token_incomplete"
  | "token_storage"
  | "host_unresolved";

export interface PostHogOAuthStart {
  state: string;
  verifier: string;
  createdAt: number;
}

export interface PostHogOAuthPending {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  host: "https://us.posthog.com" | "https://eu.posthog.com";
  scope: string;
}

export interface PostHogProject {
  id: string;
  name: string;
  organizationName: string;
}

export interface PostHogOAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

export function postHogOAuthClientMetadata() {
  return {
    client_id: POSTHOG_CLIENT_ID,
    client_name: "AppClimb",
    client_uri: POSTHOG_PUBLIC_ORIGIN,
    logo_uri: `${POSTHOG_PUBLIC_ORIGIN}/icon.svg`,
    redirect_uris: [POSTHOG_REDIRECT_URI],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    "com.posthog": {
      scopes: POSTHOG_OAUTH_SCOPES.split(" "),
    },
  };
}

function cookieBase(maxAge: number) {
  return {
    httpOnly: true,
    // Always Secure on Vercel/production; keep HTTP workable for local smoke tests.
    secure:
      process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    sameSite: "lax" as const,
    path: OAUTH_COOKIE_PATH,
    maxAge,
  };
}

function encodeCookie(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCookie(value?: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function isPostHogOAuthStart(value: unknown): value is PostHogOAuthStart {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PostHogOAuthStart>;
  return (
    typeof candidate.state === "string" &&
    /^[A-Za-z0-9_-]{32,160}$/.test(candidate.state) &&
    typeof candidate.verifier === "string" &&
    /^[A-Za-z0-9_-]{32,160}$/.test(candidate.verifier) &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt) &&
    candidate.createdAt > 0
  );
}

function isPostHogOAuthPending(value: unknown): value is PostHogOAuthPending {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PostHogOAuthPending>;
  return (
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.length > 0 &&
    candidate.accessToken.length <= 12_000 &&
    typeof candidate.refreshToken === "string" &&
    candidate.refreshToken.length > 0 &&
    candidate.refreshToken.length <= 12_000 &&
    typeof candidate.expiresAt === "string" &&
    Number.isFinite(Date.parse(candidate.expiresAt)) &&
    (candidate.host === "https://us.posthog.com" ||
      candidate.host === "https://eu.posthog.com") &&
    typeof candidate.scope === "string" &&
    candidate.scope.length <= 2_000
  );
}

export function parsePostHogOAuthToken(
  value: unknown,
): PostHogOAuthToken | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
  };
  if (
    typeof candidate.access_token !== "string" ||
    candidate.access_token.length === 0 ||
    candidate.access_token.length > 12_000 ||
    typeof candidate.refresh_token !== "string" ||
    candidate.refresh_token.length === 0 ||
    candidate.refresh_token.length > 12_000
  ) {
    return null;
  }
  const rawExpiresIn =
    typeof candidate.expires_in === "number" &&
    Number.isFinite(candidate.expires_in)
      ? candidate.expires_in
      : 3600;
  return {
    accessToken: candidate.access_token,
    refreshToken: candidate.refresh_token,
    expiresIn: Math.min(30 * 24 * 60 * 60, Math.max(60, rawExpiresIn)),
    scope:
      typeof candidate.scope === "string"
        ? candidate.scope.slice(0, 2_000)
        : "",
  };
}

export async function readPostHogOAuthStart() {
  const value = decodeCookie((await cookies()).get(START_COOKIE)?.value);
  return isPostHogOAuthStart(value) ? value : null;
}

export async function readPostHogOAuthPending() {
  const value = decodeCookie((await cookies()).get(PENDING_COOKIE)?.value);
  return isPostHogOAuthPending(value) ? value : null;
}

export async function clearPostHogOAuthPending() {
  const store = await cookies();
  store.set(PENDING_COOKIE, "", { ...cookieBase(0), maxAge: 0 });
}

/** Attach the OAuth start cookie on an explicit redirect response (more reliable than redirect()). */
export function redirectWithPostHogOAuthStart(
  location: string,
  value: PostHogOAuthStart,
) {
  const response = NextResponse.redirect(location, 302);
  response.cookies.set(START_COOKIE, encodeCookie(value), cookieBase(600));
  return response;
}

export function postHogOAuthErrorRedirect(reason: PostHogOAuthErrorReason) {
  const url = new URL(
    "/?view=sources&source=posthog&oauth=error",
    POSTHOG_PUBLIC_ORIGIN,
  );
  url.searchParams.set("oauth_reason", reason);
  const response = NextResponse.redirect(url, 302);
  response.cookies.set(START_COOKIE, "", { ...cookieBase(0), maxAge: 0 });
  return response;
}

export function postHogOAuthReadyRedirect(pending: PostHogOAuthPending) {
  const encodedPending = encodeCookie(pending);
  // Browsers commonly reject cookies larger than 4 KiB. Fail closed instead
  // of returning a misleading success that loses the OAuth credentials.
  if (encodedPending.length > 3_500) {
    return postHogOAuthErrorRedirect("token_storage");
  }
  const response = NextResponse.redirect(
    new URL("/?view=sources&source=posthog&oauth=ready", POSTHOG_PUBLIC_ORIGIN),
    302,
  );
  response.cookies.set(START_COOKIE, "", { ...cookieBase(0), maxAge: 0 });
  response.cookies.set(
    PENDING_COOKIE,
    encodedPending,
    cookieBase(900),
  );
  return response;
}

async function postHogJSON(
  host: string,
  path: string,
  accessToken: string,
) {
  return fetch(`${host}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
}

export async function resolvePostHogHost(accessToken: string) {
  for (const host of [
    "https://us.posthog.com",
    "https://eu.posthog.com",
  ] as const) {
    try {
      const response = await postHogJSON(
        host,
        "/api/organizations/?limit=1",
        accessToken,
      );
      if (response.ok) return host;
    } catch {
      // Try the other supported PostHog Cloud region.
    }
  }
  return null;
}

export async function listPostHogProjects(
  pending: PostHogOAuthPending,
): Promise<PostHogProject[]> {
  const organizationsResponse = await postHogJSON(
    pending.host,
    "/api/organizations/?limit=100",
    pending.accessToken,
  );
  if (!organizationsResponse.ok) {
    throw new Error("posthog_organizations_unavailable");
  }
  const organizationsPayload = (await organizationsResponse.json()) as {
    results?: Array<{ id?: string; name?: string }>;
  };
  const organizations = organizationsPayload.results ?? [];
  const projectLists = await Promise.all(
    organizations.map(async (organization) => {
      if (!organization.id) return [];
      const response = await postHogJSON(
        pending.host,
        `/api/organizations/${encodeURIComponent(organization.id)}/projects/?limit=100`,
        pending.accessToken,
      );
      if (!response.ok) return [];
      const payload = (await response.json()) as {
        results?: Array<{ id?: number | string; name?: string }>;
      };
      return (payload.results ?? [])
        .filter((project) => project.id != null)
        .map((project) => ({
          id: String(project.id),
          name: project.name?.trim() || `Project ${project.id}`,
          organizationName:
            organization.name?.trim() || "PostHog organization",
        }));
    }),
  );
  return projectLists
    .flat()
    .sort((left, right) =>
      `${left.organizationName} ${left.name}`.localeCompare(
        `${right.organizationName} ${right.name}`,
      ),
    );
}
