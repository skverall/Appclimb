import "server-only";

import { cookies } from "next/headers";

export const POSTHOG_CLIENT_ID =
  "https://appclimb.app/api/oauth/posthog/client";
export const POSTHOG_REDIRECT_URI =
  "https://appclimb.app/api/oauth/posthog/callback";
export const POSTHOG_OAUTH_SCOPES =
  "organization:read project:read query:read";

const START_COOKIE = "appclimb_posthog_oauth_start";
const PENDING_COOKIE = "appclimb_posthog_oauth_pending";

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

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/oauth/posthog",
    maxAge,
  };
}

function encodeCookie(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCookie<T>(value?: string): T | null {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function setPostHogOAuthStart(value: PostHogOAuthStart) {
  (await cookies()).set(START_COOKIE, encodeCookie(value), cookieOptions(600));
}

export async function readPostHogOAuthStart() {
  return decodeCookie<PostHogOAuthStart>(
    (await cookies()).get(START_COOKIE)?.value,
  );
}

export async function clearPostHogOAuthStart() {
  (await cookies()).delete(START_COOKIE);
}

export async function setPostHogOAuthPending(value: PostHogOAuthPending) {
  (await cookies()).set(
    PENDING_COOKIE,
    encodeCookie(value),
    cookieOptions(900),
  );
}

export async function readPostHogOAuthPending() {
  return decodeCookie<PostHogOAuthPending>(
    (await cookies()).get(PENDING_COOKIE)?.value,
  );
}

export async function clearPostHogOAuthPending() {
  (await cookies()).delete(PENDING_COOKIE);
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
    const response = await postHogJSON(
      host,
      "/api/organizations/?limit=1",
      accessToken,
    );
    if (response.ok) return host;
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
