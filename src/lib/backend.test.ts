import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieValues = vi.hoisted(() => new Map<string, string>());
const cookieStore = vi.hoisted(() => ({
  get(name: string) {
    const value = cookieValues.get(name);
    return value ? { value } : undefined;
  },
  set(name: string, value: string) {
    cookieValues.set(name, value);
  },
  delete(name: string) {
    cookieValues.delete(name);
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

import {
  backendSessionPresence,
  clearBackendSession,
  createSessionFromResponse,
  getRefreshToken,
  readBackend,
  refreshBackendSession,
  relayBackendResponse,
  requestWithSession,
  setBackendSession,
} from "@/lib/backend";

const refreshedTokens = {
  accessToken: "access-new",
  refreshToken: "refresh-new",
  accessTokenExpiresAt: "2026-07-25T13:00:00Z",
  refreshTokenExpiresAt: "2026-08-24T12:00:00Z",
};

beforeEach(() => {
  cookieValues.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("backend session recovery", () => {
  it("recovers a refresh-only session before relaying the private request", async () => {
    cookieValues.set("appclimb_refresh", "refresh-old");
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/v1/auth/refresh")) {
          expect(JSON.parse(String(init?.body))).toEqual({
            refreshToken: "refresh-old",
          });
          return Response.json({ data: { tokens: refreshedTokens } });
        }
        if (url.endsWith("/v1/me")) {
          expect(new Headers(init?.headers).get("authorization")).toBe(
            "Bearer access-new",
          );
          return Response.json({ data: { userId: "user-1" } });
        }
        throw new Error(`unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestWithSession("/v1/me");

    expect(response?.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cookieValues.get("appclimb_access")).toBe("access-new");
    expect(cookieValues.get("appclimb_refresh")).toBe("refresh-new");
  });

  it("preserves the refresh cookie when the backend is temporarily unavailable", async () => {
    cookieValues.set("appclimb_refresh", "refresh-old");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    await expect(refreshBackendSession()).resolves.toBe("unavailable");
    expect(cookieValues.get("appclimb_refresh")).toBe("refresh-old");
    expect(cookieValues.has("appclimb_access")).toBe(false);
  });

  it("clears both cookies when the refresh token is rejected", async () => {
    cookieValues.set("appclimb_access", "access-expired");
    cookieValues.set("appclimb_refresh", "refresh-invalid");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        String(input).endsWith("/v1/auth/refresh")
          ? Response.json({ error: "invalid_refresh_token" }, { status: 401 })
          : Response.json({ error: "invalid_access_token" }, { status: 401 }),
      ),
    );

    const response = await requestWithSession("/v1/me");

    expect(response?.status).toBe(401);
    expect(cookieValues.has("appclimb_access")).toBe(false);
    expect(cookieValues.has("appclimb_refresh")).toBe(false);
  });

  it("makes no request at all when the visitor has no session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestWithSession("/v1/me")).resolves.toBeNull();
    await expect(readBackend("/v1/me")).resolves.toBeNull();
    await expect(refreshBackendSession()).resolves.toBe("missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not attempt a refresh when a valid access token succeeds", async () => {
    cookieValues.set("appclimb_access", "access-live");
    cookieValues.set("appclimb_refresh", "refresh-live");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { userId: "user-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestWithSession("/v1/me");

    expect(response?.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cookieValues.get("appclimb_refresh")).toBe("refresh-live");
  });

  // A 401 with no refresh token must surface as-is rather than being retried.
  it("returns the 401 unchanged when there is nothing to refresh with", async () => {
    cookieValues.set("appclimb_access", "access-expired");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ error: "expired" }, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestWithSession("/v1/me");

    expect(response?.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats an unreadable refresh payload as an invalid session", async () => {
    cookieValues.set("appclimb_refresh", "refresh-old");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 200 })),
    );

    await expect(refreshBackendSession()).resolves.toBe("invalid");
    expect(cookieValues.has("appclimb_refresh")).toBe(false);
  });

  it("treats a refresh response without tokens as an invalid session", async () => {
    cookieValues.set("appclimb_refresh", "refresh-old");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ data: {} })),
    );

    await expect(refreshBackendSession()).resolves.toBe("invalid");
    expect(cookieValues.has("appclimb_refresh")).toBe(false);
  });
});

describe("backend session cookies", () => {
  it("reports which half of the session is present", async () => {
    await expect(backendSessionPresence()).resolves.toEqual({
      hasAccessToken: false,
      hasRefreshToken: false,
    });

    await setBackendSession(refreshedTokens);
    await expect(backendSessionPresence()).resolves.toEqual({
      hasAccessToken: true,
      hasRefreshToken: true,
    });
    await expect(getRefreshToken()).resolves.toBe("refresh-new");

    await clearBackendSession();
    await expect(backendSessionPresence()).resolves.toEqual({
      hasAccessToken: false,
      hasRefreshToken: false,
    });
    await expect(getRefreshToken()).resolves.toBeUndefined();
  });
});

describe("createSessionFromResponse", () => {
  it("stores tokens and returns the identity on a complete payload", async () => {
    const identity = {
      userId: "user-1",
      email: "builder@example.com",
      workspaceId: "ws-1",
      workspaceName: "Private workspace",
      role: "owner",
      trialEndsAt: "2026-08-08T12:00:00Z",
      subscriptionStatus: "trialing",
    };

    await expect(
      createSessionFromResponse(
        Response.json({ data: { tokens: refreshedTokens, identity } }),
      ),
    ).resolves.toEqual(identity);
    expect(cookieValues.get("appclimb_access")).toBe("access-new");
  });

  // Half a payload must never leave the browser holding a session cookie.
  it.each([
    ["an error status", Response.json({ data: {} }, { status: 401 })],
    ["no tokens", Response.json({ data: { identity: { userId: "u" } } })],
    ["no identity", Response.json({ data: { tokens: refreshedTokens } })],
  ])("returns null and sets no cookie for %s", async (_label, response) => {
    await expect(createSessionFromResponse(response)).resolves.toBeNull();
    expect(cookieValues.has("appclimb_access")).toBe(false);
  });
});

describe("relayBackendResponse", () => {
  it("forwards status and content type but drops backend headers", async () => {
    const relayed = await relayBackendResponse(
      new Response(JSON.stringify({ error: "plan_required" }), {
        status: 402,
        headers: {
          "content-type": "application/json",
          "set-cookie": "backend_session=leak",
          "x-internal-trace": "trace-1",
        },
      }),
    );

    expect(relayed.status).toBe(402);
    expect(relayed.headers.get("content-type")).toBe("application/json");
    expect(relayed.headers.get("set-cookie")).toBeNull();
    expect(relayed.headers.get("x-internal-trace")).toBeNull();
    await expect(relayed.json()).resolves.toEqual({ error: "plan_required" });
  });

  // The API answers 204 for logout, account deletion and source
  // disconnection. Relaying a body with those statuses throws, which turned a
  // successful disconnect into a 500.
  it.each([204, 205, 304])(
    "relays %i without attaching a body",
    async (status) => {
      const relayed = await relayBackendResponse(
        new Response(null, { status }),
      );
      expect(relayed.status).toBe(status);
      expect(relayed.body).toBeNull();
    },
  );

  it("omits the content type when the backend sent none", async () => {
    const relayed = await relayBackendResponse(
      new Response(null, { status: 200 }),
    );
    expect(relayed.status).toBe(200);
    expect(relayed.headers.get("content-type")).toBeNull();
  });
});
