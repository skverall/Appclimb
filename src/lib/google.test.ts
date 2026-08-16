import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  googleCallbackUrl,
  OAUTH_STATE_COOKIE,
  readGoogleCredentials,
} from "@/lib/google";

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("readGoogleCredentials", () => {
  const origId = process.env.GOOGLE_CLIENT_ID;
  const origSecret = process.env.GOOGLE_CLIENT_SECRET;

  afterEach(() => {
    if (origId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = origId;
    if (origSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = origSecret;
  });

  it("returns null when either credential is missing", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(readGoogleCredentials()).toBeNull();

    process.env.GOOGLE_CLIENT_ID = "id";
    expect(readGoogleCredentials()).toBeNull();

    delete process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(readGoogleCredentials()).toBeNull();
  });

  it("returns credentials when both are present", () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(readGoogleCredentials()).toEqual({ clientId: "id", clientSecret: "secret" });
  });
});

describe("buildGoogleAuthUrl", () => {
  it("builds a consent url with required params", () => {
    const url = buildGoogleAuthUrl({
      clientId: "cid",
      redirectUri: "https://appclimb.app/api/auth/google/callback",
      state: "s123",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(parsed.searchParams.get("client_id")).toBe("cid");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://appclimb.app/api/auth/google/callback");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("state")).toBe("s123");
    expect(parsed.searchParams.get("scope")).toContain("openid");
  });

  it("googleCallbackUrl appends the callback path", () => {
    expect(googleCallbackUrl("https://appclimb.app")).toBe("https://appclimb.app/api/auth/google/callback");
    expect(OAUTH_STATE_COOKIE).toBe("appclimb_oauth_state");
  });
});

describe("exchangeCodeForTokens", () => {
  const creds = { clientId: "cid", clientSecret: "csecret" };

  afterEach(() => vi.unstubAllGlobals());

  it("returns tokens on success", async () => {
    const fetchMock = vi.fn<FetchFn>(async () => new Response(JSON.stringify({ access_token: "at" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await exchangeCodeForTokens({ creds, code: "c", redirectUri: "https://x/cb" });
    expect(res?.access_token).toBe("at");
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.get("code")).toBe("c");
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("returns an error object on a failed exchange", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchFn>(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })),
    );
    const res = await exchangeCodeForTokens({ creds, code: "bad", redirectUri: "https://x/cb" });
    expect(res?.error).toBe("invalid_grant");
  });

  it("returns network_error on throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchFn>(async () => {
        throw new Error("boom");
      }),
    );
    const res = await exchangeCodeForTokens({ creds, code: "c", redirectUri: "https://x/cb" });
    expect(res?.error).toBe("network_error");
  });
});

describe("fetchGoogleUserInfo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns profile info", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchFn>(async () =>
        new Response(
          JSON.stringify({ sub: "g1", email: "a@b.com", email_verified: true, name: "A", picture: "p" }),
          { status: 200 },
        ),
      ),
    );
    const info = await fetchGoogleUserInfo("at");
    expect(info).toEqual({ sub: "g1", email: "a@b.com", email_verified: true, name: "A", picture: "p" });
  });

  it("returns null when sub or email is missing", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchFn>(async () => new Response(JSON.stringify({ email: "a@b.com" }), { status: 200 })));
    expect(await fetchGoogleUserInfo("at")).toBeNull();
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchFn>(async () => new Response("{}", { status: 401 })));
    expect(await fetchGoogleUserInfo("at")).toBeNull();
  });

  it("returns null on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchFn>(async () => {
        throw new Error("boom");
      }),
    );
    expect(await fetchGoogleUserInfo("at")).toBeNull();
  });
});
