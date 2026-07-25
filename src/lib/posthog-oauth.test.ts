import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cookieValues = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = cookieValues.get(name);
      return value ? { name, value } : undefined;
    },
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

import {
  POSTHOG_CLIENT_ID,
  POSTHOG_REDIRECT_URI,
  parsePostHogOAuthToken,
  postHogOAuthClientMetadata,
  postHogOAuthErrorRedirect,
  postHogOAuthReadyRedirect,
  readPostHogOAuthPending,
  redirectWithPostHogOAuthStart,
} from "@/lib/posthog-oauth";

afterEach(() => {
  cookieValues.clear();
  vi.unstubAllEnvs();
});

describe("postHogOAuthClientMetadata", () => {
  it("publishes a CIMD document whose client_id matches the host URL", () => {
    const metadata = postHogOAuthClientMetadata();
    expect(metadata.client_id).toBe(POSTHOG_CLIENT_ID);
    expect(metadata.client_id).toBe(
      "https://appclimb.app/api/oauth/posthog/client",
    );
    expect(metadata.redirect_uris).toEqual([POSTHOG_REDIRECT_URI]);
    expect(metadata.token_endpoint_auth_method).toBe("none");
    expect(metadata.grant_types).toContain("authorization_code");
    expect(metadata.grant_types).toContain("refresh_token");
    expect(metadata.response_types).toEqual(["code"]);
    expect(metadata["com.posthog"]).toEqual({
      scopes: ["organization:read", "project:read", "query:read"],
    });
    expect("com.posthog.scopes" in metadata).toBe(false);
  });
});

describe("PostHog OAuth redirects", () => {
  it("attaches the PKCE start cookie to the authorization redirect", () => {
    vi.stubEnv("VERCEL", "1");

    const response = redirectWithPostHogOAuthStart(
      "https://oauth.posthog.com/oauth/authorize/?client_id=test",
      {
        state: "s".repeat(43),
        verifier: "v".repeat(64),
        createdAt: 1_722_000_000_000,
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "https://oauth.posthog.com/oauth/authorize/",
    );
    expect(response.cookies.get("appclimb_posthog_oauth_start")?.value).toBe(
      Buffer.from(
        JSON.stringify({
          state: "s".repeat(43),
          verifier: "v".repeat(64),
          createdAt: 1_722_000_000_000,
        }),
        "utf8",
      ).toString("base64url"),
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain(
      "Path=/api/oauth/posthog",
    );
  });

  it("returns a canonical reason and expires start state on failure", () => {
    const response = postHogOAuthErrorRedirect("state_mismatch");
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.origin).toBe("https://appclimb.app");
    expect(location.searchParams.get("oauth")).toBe("error");
    expect(location.searchParams.get("oauth_reason")).toBe("state_mismatch");
    expect(response.cookies.get("appclimb_posthog_oauth_start")?.value).toBe(
      "",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("stores pending credentials only for a supported PostHog Cloud host", () => {
    const response = postHogOAuthReadyRedirect({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: "2026-07-25T17:00:00.000Z",
      host: "https://eu.posthog.com",
      scope: "organization:read project:read query:read",
    });

    expect(response.headers.get("location")).toContain("oauth=ready");
    expect(response.cookies.get("appclimb_posthog_oauth_pending")?.value).toBe(
      Buffer.from(
        JSON.stringify({
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: "2026-07-25T17:00:00.000Z",
          host: "https://eu.posthog.com",
          scope: "organization:read project:read query:read",
        }),
        "utf8",
      ).toString("base64url"),
    );
  });

  it("fails closed when provider credentials exceed safe cookie size", () => {
    const response = postHogOAuthReadyRedirect({
      accessToken: "a".repeat(3_000),
      refreshToken: "r".repeat(3_000),
      expiresAt: "2026-07-25T17:00:00.000Z",
      host: "https://us.posthog.com",
      scope: "project:read",
    });
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.searchParams.get("oauth")).toBe("error");
    expect(location.searchParams.get("oauth_reason")).toBe("token_storage");
    expect(
      response.cookies.get("appclimb_posthog_oauth_pending"),
    ).toBeUndefined();
  });
});

describe("readPostHogOAuthPending", () => {
  it("rejects a tampered host before any server-side provider request", async () => {
    cookieValues.set(
      "appclimb_posthog_oauth_pending",
      Buffer.from(
        JSON.stringify({
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: "2026-07-25T17:00:00.000Z",
          host: "https://example.com",
          scope: "project:read",
        }),
        "utf8",
      ).toString("base64url"),
    );

    await expect(readPostHogOAuthPending()).resolves.toBeNull();
  });
});

describe("parsePostHogOAuthToken", () => {
  it("normalizes a complete provider response", () => {
    expect(
      parsePostHogOAuthToken({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 1800,
        scope: "project:read",
      }),
    ).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 1800,
      scope: "project:read",
    });
  });

  it("rejects incomplete credentials and bounds provider-controlled fields", () => {
    expect(
      parsePostHogOAuthToken({
        access_token: "access-token",
      }),
    ).toBeNull();
    expect(
      parsePostHogOAuthToken({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: Number.POSITIVE_INFINITY,
        scope: "s".repeat(3_000),
      }),
    ).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
      scope: "s".repeat(2_000),
    });
  });
});
