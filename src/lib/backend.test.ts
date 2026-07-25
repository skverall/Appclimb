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
  refreshBackendSession,
  requestWithSession,
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
});
