import { generateKeyPairSync, verify as verifySignature } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { appleConnector, createAppleToken } from "@/lib/connectors/apple";
import { verifyConnector } from "@/lib/connectors";
import { postHogConnector } from "@/lib/connectors/posthog";
import { revenueCatConnector } from "@/lib/connectors/revenuecat";
import { superwallConnector } from "@/lib/connectors/superwall";
import { ConnectorError } from "@/lib/connectors/types";

const appleKeyPair = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function okResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("connector verification", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses RevenueCat v2 bearer auth and chart read scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ object: "chart_options" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await revenueCatConnector.verify({
      apiKey: "secret",
      projectId: "proj_123",
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.revenuecat.com/v2/projects/proj_123/charts/revenue/options",
      expect.objectContaining({
        headers: { Authorization: "Bearer secret" },
      }),
    );
  });

  it("marks rate limits retryable and revoked keys non-retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 429 })),
    );
    await expect(
      revenueCatConnector.verify({
        apiKey: "limited",
        projectId: "proj",
      }),
    ).rejects.toMatchObject({
      retryable: true,
    } satisfies Partial<ConnectorError>);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );
    await expect(
      revenueCatConnector.verify({
        apiKey: "revoked",
        projectId: "proj",
      }),
    ).rejects.toMatchObject({
      retryable: false,
    } satisfies Partial<ConnectorError>);
  });

  it("rejects non-HTTPS PostHog hosts before sending a secret", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postHogConnector.verify({
        host: "http://example.com",
        personalApiKey: "secret",
        projectId: "1",
      }),
    ).rejects.toThrow("must use HTTPS");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reduces a PostHog host to its origin before building the URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ name: "CanopyBid" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await postHogConnector.verify({
      host: "https://us.posthog.com/project/509825?tab=events",
      personalApiKey: "phx_secret",
      projectId: "509825",
    });

    expect(result.accountLabel).toBe("CanopyBid");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://us.posthog.com/api/projects/509825/",
      expect.objectContaining({
        headers: { Authorization: "Bearer phx_secret" },
      }),
    );
  });

  it("falls back to the project id when PostHog omits a name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({})));
    const result = await postHogConnector.verify({
      host: "https://eu.posthog.com",
      personalApiKey: "phx_secret",
      projectId: "509825",
    });
    expect(result.accountLabel).toBe("509825");
  });

  it("prefers Superwall's nested project name over the flat one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okResponse({ name: "flat", data: { name: "Car Dealer Tracker" } }),
      ),
    );
    await expect(
      superwallConnector
        .verify({ apiKey: "sw_key", projectId: "proj" })
        .then((result) => result.accountLabel),
    ).resolves.toBe("Car Dealer Tracker");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ name: "flat only" })),
    );
    await expect(
      superwallConnector
        .verify({ apiKey: "sw_key", projectId: "proj" })
        .then((result) => result.accountLabel),
    ).resolves.toBe("flat only");
  });

  it("escapes the project id Superwall receives in the path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await superwallConnector.verify({
      apiKey: "sw_key",
      projectId: "proj/../admin",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.superwall.com/v2/projects/proj%2F..%2Fadmin",
      expect.anything(),
    );
  });

  it("treats server errors as retryable and client errors as permanent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
    );
    await expect(
      superwallConnector.verify({ apiKey: "k", projectId: "p" }),
    ).rejects.toMatchObject({ status: 503, retryable: true });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 404 })),
    );
    await expect(
      superwallConnector.verify({ apiKey: "k", projectId: "p" }),
    ).rejects.toMatchObject({ status: 404, retryable: false });
  });
});

describe("createAppleToken", () => {
  const credentials = {
    issuerId: "69a6de70-1111-2222-3333-444455556666",
    keyId: "ABCD1234EF",
    privateKey: appleKeyPair.privateKey,
  };

  it("signs an ES256 assertion App Store Connect will accept", () => {
    const token = createAppleToken(credentials, 1_800_000_000);
    const [header, payload, signature] = token.split(".");

    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "ABCD1234EF",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      iss: credentials.issuerId,
      iat: 1_800_000_000,
      // Apple rejects assertions valid for longer than 20 minutes.
      exp: 1_800_000_000 + 900,
      aud: "appstoreconnect-v1",
    });

    expect(
      verifySignature(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        { key: appleKeyPair.publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
  });

  it("does not reuse a timestamp between assertions", () => {
    expect(createAppleToken(credentials, 1_800_000_000)).not.toBe(
      createAppleToken(credentials, 1_800_000_060),
    );
  });

  it("sends the assertion as a bearer token and reads back the app name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ data: [{ attributes: { name: "Car Dealer Tracker" } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await appleConnector.verify(credentials);
    expect(result.accountLabel).toBe("Car Dealer Tracker");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.appstoreconnect.apple.com/v1/apps?limit=1");
    expect(init.headers.Authorization).toMatch(
      /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/,
    );
    vi.unstubAllGlobals();
  });

  it("reports no account label when the team has no apps yet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ data: [] })));
    const result = await appleConnector.verify(credentials);
    expect(result.ok).toBe(true);
    expect(result.accountLabel).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe("verifyConnector", () => {
  afterEach(() => vi.unstubAllGlobals());

  // The route handlers pass a flat credential bag, so this mapping is the only
  // thing keeping each provider's fields pointed at the right API.
  it.each([
    [
      "revenuecat" as const,
      { apiKey: "rc_key", projectId: "rc_proj" },
      "https://api.revenuecat.com/v2/projects/rc_proj/charts/revenue/options",
    ],
    [
      "posthog" as const,
      {
        personalApiKey: "phx_key",
        projectId: "509825",
        host: "https://us.posthog.com",
      },
      "https://us.posthog.com/api/projects/509825/",
    ],
    [
      "superwall" as const,
      { apiKey: "sw_key", projectId: "sw_proj" },
      "https://api.superwall.com/v2/projects/sw_proj",
    ],
  ])("routes %s to its own API", async (provider, credentials, url) => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyConnector(provider, credentials);
    expect(result.provider).toBe(provider);
    expect(fetchMock.mock.calls[0][0]).toBe(url);
  });

  it("routes App Store Connect through the signed-assertion client", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyConnector("app-store-connect", {
      appId: "6743210987",
      issuerId: "69a6de70-1111-2222-3333-444455556666",
      keyId: "ABCD1234EF",
      privateKey: appleKeyPair.privateKey,
    });

    expect(result.provider).toBe("app-store-connect");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.appstoreconnect.apple.com/v1/apps?limit=1",
    );
  });
});
