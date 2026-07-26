import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cookieValues = vi.hoisted(() => new Map<string, string>());
const cookieSet = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = cookieValues.get(name);
      return value ? { name, value } : undefined;
    },
    set: cookieSet,
    delete: vi.fn(),
  })),
}));

import {
  POSTHOG_CLIENT_ID,
  POSTHOG_REDIRECT_URI,
  clearPostHogOAuthPending,
  listPostHogEvents,
  listPostHogProjects,
  parsePostHogOAuthToken,
  postHogOAuthClientMetadata,
  postHogOAuthErrorRedirect,
  postHogOAuthReadyRedirect,
  readPostHogOAuthPending,
  readPostHogOAuthStart,
  redirectWithPostHogOAuthStart,
  resolvePostHogHost,
} from "@/lib/posthog-oauth";

function encodeCookieValue(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

const pendingCredentials = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: "2026-07-25T17:00:00.000Z",
  host: "https://us.posthog.com",
  scope: "organization:read project:read",
} as const;

afterEach(() => {
  cookieValues.clear();
  cookieSet.mockClear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
    vi.stubEnv("NODE_ENV", "production");

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

  it("rejects a cookie that is not decodable JSON", async () => {
    cookieValues.set("appclimb_posthog_oauth_pending", "not-base64-json");
    await expect(readPostHogOAuthPending()).resolves.toBeNull();
  });

  it("returns credentials for a supported host", async () => {
    cookieValues.set(
      "appclimb_posthog_oauth_pending",
      encodeCookieValue(pendingCredentials),
    );
    await expect(readPostHogOAuthPending()).resolves.toEqual(
      pendingCredentials,
    );
  });
});

describe("readPostHogOAuthStart", () => {
  it("returns a well-formed PKCE start", async () => {
    const start = {
      state: "s".repeat(43),
      verifier: "v".repeat(64),
      createdAt: 1_722_000_000_000,
    };
    cookieValues.set(
      "appclimb_posthog_oauth_start",
      encodeCookieValue(start),
    );
    await expect(readPostHogOAuthStart()).resolves.toEqual(start);
  });

  it("returns null when no start cookie is present", async () => {
    await expect(readPostHogOAuthStart()).resolves.toBeNull();
  });

  // A short or oddly-shaped verifier means the cookie did not come from our
  // own start handler, so PKCE would not be protecting the exchange.
  it.each([
    ["a state below the length floor", { state: "s".repeat(8) }],
    ["a state with illegal characters", { state: `${"s".repeat(42)}!` }],
    ["a verifier below the length floor", { verifier: "v".repeat(8) }],
    ["a verifier above the length ceiling", { verifier: "v".repeat(200) }],
    ["a non-numeric timestamp", { createdAt: "yesterday" }],
    ["a non-positive timestamp", { createdAt: 0 }],
  ])("rejects %s", async (_label, override) => {
    cookieValues.set(
      "appclimb_posthog_oauth_start",
      encodeCookieValue({
        state: "s".repeat(43),
        verifier: "v".repeat(64),
        createdAt: 1_722_000_000_000,
        ...override,
      }),
    );
    await expect(readPostHogOAuthStart()).resolves.toBeNull();
  });
});

describe("clearPostHogOAuthPending", () => {
  it("expires the pending cookie on the OAuth path", async () => {
    await clearPostHogOAuthPending();
    expect(cookieSet).toHaveBeenCalledWith(
      "appclimb_posthog_oauth_pending",
      "",
      expect.objectContaining({
        maxAge: 0,
        httpOnly: true,
        path: "/api/oauth/posthog",
      }),
    );
  });
});

describe("resolvePostHogHost", () => {
  it("returns the first region that accepts the token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolvePostHogHost("access-token")).resolves.toBe(
      "https://us.posthog.com",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://us.posthog.com/api/organizations/?limit=1",
    );
    expect(
      new Headers(fetchMock.mock.calls[0][1].headers).get("authorization"),
    ).toBe("Bearer access-token");
  });

  it("falls back to the EU region when the US region rejects the token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolvePostHogHost("access-token")).resolves.toBe(
      "https://eu.posthog.com",
    );
  });

  it("survives a network failure and still tries the other region", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolvePostHogHost("access-token")).resolves.toBe(
      "https://eu.posthog.com",
    );
  });

  it("returns null rather than guessing when neither region works", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolvePostHogHost("access-token")).resolves.toBeNull();
    // Only the two allow-listed hosts may ever see the access token.
    expect(fetchMock.mock.calls.map((call) => new URL(call[0]).origin)).toEqual([
      "https://us.posthog.com",
      "https://eu.posthog.com",
    ]);
  });
});

describe("listPostHogProjects", () => {
  function respondWith(routes: Record<string, unknown>) {
    return vi.fn(async (url: string) => {
      const match = Object.entries(routes).find(([path]) =>
        url.includes(path),
      );
      if (!match) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify(match[1]), { status: 200 });
    });
  }

  it("collects projects across organizations and sorts them", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith({
        "/api/organizations/?limit=100": {
          results: [
            { id: "org-b", name: "Zeta Studio" },
            { id: "org-a", name: "Aydmaxx Studio" },
          ],
        },
        "/api/organizations/org-b/projects/": {
          results: [{ id: 7, name: "Zeta App" }],
        },
        "/api/organizations/org-a/projects/": {
          results: [
            { id: 509825, name: "CanopyBid" },
            { id: 490129, name: "  " },
          ],
        },
      }),
    );

    // Sorted by "<organization> <project>", so the blank-named project falls
    // back to "Project 490129" and sorts after "CanopyBid".
    await expect(listPostHogProjects(pendingCredentials)).resolves.toEqual([
      {
        id: "509825",
        name: "CanopyBid",
        organizationName: "Aydmaxx Studio",
      },
      {
        id: "490129",
        name: "Project 490129",
        organizationName: "Aydmaxx Studio",
      },
      { id: "7", name: "Zeta App", organizationName: "Zeta Studio" },
    ]);
  });

  it("skips organizations without an id and projects without one", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith({
        "/api/organizations/?limit=100": {
          results: [{ name: "Nameless org" }, { id: "org-a", name: "" }],
        },
        "/api/organizations/org-a/projects/": {
          results: [{ name: "no id" }, { id: 1, name: "Kept" }],
        },
      }),
    );

    await expect(listPostHogProjects(pendingCredentials)).resolves.toEqual([
      { id: "1", name: "Kept", organizationName: "PostHog organization" },
    ]);
  });

  it("drops an organization whose project list cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith({
        "/api/organizations/?limit=100": {
          results: [{ id: "org-a", name: "Aydmaxx Studio" }],
        },
      }),
    );
    await expect(listPostHogProjects(pendingCredentials)).resolves.toEqual([]);
  });

  it("throws when the organizations endpoint itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 500 })),
    );
    await expect(listPostHogProjects(pendingCredentials)).rejects.toThrow(
      "posthog_organizations_unavailable",
    );
  });
});

describe("listPostHogEvents", () => {
  it("returns only valid event names seen in the selected project", async () => {
    const fetchMock = vi.fn(
      async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          query: { kind: string; query: string };
        };
        expect(body.query.kind).toBe("HogQLQuery");
        expect(body.query.query).toContain("interval 30 day");
        return Response.json({
          results: [
            ["Application Opened", 18, 7, "2026-07-25T12:00:00Z"],
            ["$screen", 120, 11, "2026-07-26T09:00:00Z"],
            ["bad\nevent", 1, 1, "2026-07-26T09:00:00Z"],
          ],
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listPostHogEvents(pendingCredentials, "509825"),
    ).resolves.toEqual([
      {
        name: "Application Opened",
        eventCount: 18,
        uniqueUsers: 7,
        lastSeenAt: "2026-07-25T12:00:00.000Z",
      },
      {
        name: "$screen",
        eventCount: 120,
        uniqueUsers: 11,
        lastSeenAt: "2026-07-26T09:00:00.000Z",
      },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://us.posthog.com/api/projects/509825/query/",
    );
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization")).toBe(
      "Bearer access-token",
    );
  });

  it("rejects a project id that cannot be placed in the API path", async () => {
    await expect(
      listPostHogEvents(pendingCredentials, "../organization"),
    ).rejects.toThrow("invalid_posthog_project");
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
