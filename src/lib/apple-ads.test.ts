import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APPLE_ADS_API_ORIGIN,
  APPLE_ADS_POPULARITY_PATH,
  APPLE_ADS_TOKEN_URL,
  buildClientSecretPayload,
  buildTermsQuery,
  clearAppleAdsTokenCache,
  getAppleAdsAccessToken,
  lastCompleteUtcWeek,
  queryPopularityRows,
  shiftUtcWeek,
  normalizePrivateKeyPem,
  readAppleAdsCredentials,
  toPkcs8Pem,
} from "@/lib/apple-ads";

const credsBase = {
  clientId: "SEARCHADS.client",
  teamId: "SEARCHADS.team",
  keyId: "SEARCHADS.key",
  adAccountId: "123456",
};

async function generateTestCreds() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const bytes = new Uint8Array(pkcs8);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----`;
  return { ...credsBase, privateKey: pem };
}

afterEach(() => {
  clearAppleAdsTokenCache();
});

describe("lastCompleteUtcWeek", () => {
  it("returns the previous Sun–Sat week from mid-week", () => {
    // Wednesday 12 Aug 2026 UTC
    expect(lastCompleteUtcWeek(new Date("2026-08-12T15:00:00Z"))).toEqual({
      start: "2026-08-02",
      end: "2026-08-08",
    });
  });

  it("does not treat an in-progress Saturday as complete", () => {
    expect(lastCompleteUtcWeek(new Date("2026-08-15T12:00:00Z"))).toEqual({
      start: "2026-08-02",
      end: "2026-08-08",
    });
  });

  it("uses the week that ended yesterday when today is Sunday", () => {
    expect(lastCompleteUtcWeek(new Date("2026-08-16T00:30:00Z"))).toEqual({
      start: "2026-08-09",
      end: "2026-08-15",
    });
  });
});

describe("credentials", () => {
  it("requires every Ads secret", () => {
    expect(readAppleAdsCredentials({})).toBeNull();
    expect(
      readAppleAdsCredentials({
        APPLE_ADS_CLIENT_ID: "c",
        APPLE_ADS_TEAM_ID: "t",
        APPLE_ADS_KEY_ID: "k",
        APPLE_ADS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----",
        APPLE_ADS_ACCOUNT_ID: "1",
      }),
    ).toEqual({
      clientId: "c",
      teamId: "t",
      keyId: "k",
      privateKey: "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----",
      adAccountId: "1",
    });
  });

  it("normalizes escaped PEM newlines", () => {
    expect(normalizePrivateKeyPem("-----BEGIN PRIVATE KEY-----\\nX\\n-----END PRIVATE KEY-----")).toContain(
      "\nX\n",
    );
  });

  it("converts SEC1 EC PRIVATE KEY into PKCS8", async () => {
    const { execFileSync } = await import("node:child_process");
    const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "asa-"));
    const sec1Path = join(dir, "sec1.pem");
    try {
      execFileSync("openssl", [
        "ecparam",
        "-name",
        "prime256v1",
        "-genkey",
        "-noout",
        "-out",
        sec1Path,
      ]);
      const sec1 = readFileSync(sec1Path, "utf8");
      expect(sec1).toContain("BEGIN EC PRIVATE KEY");
      const pkcs8 = toPkcs8Pem(sec1);
      expect(pkcs8).toContain("BEGIN PRIVATE KEY");
      expect(pkcs8).not.toContain("BEGIN EC PRIVATE KEY");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("client secret payload", () => {
  it("uses team id as issuer and client id as subject", () => {
    expect(buildClientSecretPayload(credsBase, 1_700_000_000)).toEqual({
      iss: "SEARCHADS.team",
      sub: "SEARCHADS.client",
      aud: "https://appleid.apple.com",
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
  });
});

describe("buildTermsQuery", () => {
  it("pages a whole storefront week without a genre filter", () => {
    const query = buildTermsQuery({
      country: "US",
      range: { start: "2026-08-02", end: "2026-08-08" },
      offset: 2000,
    });
    expect(query).toMatchObject({
      timeRange: { start: "2026-08-02", end: "2026-08-08", granularity: "WEEKLY_SUN_SAT" },
      pagination: { offset: 2000, pageSize: 1000 },
    });
    expect(query.fields).toEqual(
      expect.arrayContaining(["searchPopularity1to100", "rankInGenre"]),
    );
    expect(query.filters).toEqual([
      { field: "countryOrRegion", operator: "EQUALS", value: "US" },
    ]);
  });

  it("asks for exact terms with an IN filter", () => {
    const query = buildTermsQuery({
      country: "DE",
      range: { start: "2025-09-28", end: "2026-09-26" },
      terms: ["schlaf", "meditation"],
    });
    expect(query.filters).toEqual([
      { field: "countryOrRegion", operator: "EQUALS", value: "DE" },
      { field: "searchTerm", operator: "IN", value: ["schlaf", "meditation"] },
    ]);
  });
});

describe("queryPopularityRows", () => {
  it("mints a token, sends the account context, and returns rows", async () => {
    const creds = await generateTestCreds();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === APPLE_ADS_TOKEN_URL) {
        const body = String(init?.body ?? "");
        expect(body).toContain("grant_type=client_credentials");
        expect(body).toContain("scope=searchadsorg");
        return Response.json({ access_token: "tok", expires_in: 3600 });
      }
      if (url === `${APPLE_ADS_API_ORIGIN}${APPLE_ADS_POPULARITY_PATH}`) {
        expect((init?.headers as Record<string, string>)["X-AP-Context"]).toBe(
          "adAccountId=123456",
        );
        return Response.json({
          result: {
            rows: [
              {
                searchTerm: "meditation",
                genre: "HEALTH_FITNESS",
                searchPopularity1to100: 52,
                rankInGenre: 241,
                week: "2026-09-20",
              },
            ],
          },
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    const rows = await queryPopularityRows(
      creds,
      buildTermsQuery({ country: "US", range: { start: "2026-09-20", end: "2026-09-26" } }),
      { fetchImpl: fetchImpl as unknown as typeof fetch, now: new Date("2026-10-01T12:00:00Z") },
    );
    expect(rows).toEqual([
      expect.objectContaining({ searchTerm: "meditation", searchPopularity1to100: 52 }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const cached = await getAppleAdsAccessToken(creds, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: new Date("2026-10-01T12:01:00Z"),
    });
    expect(cached).toBe("tok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refreshes the token once after a 401", async () => {
    const creds = await generateTestCreds();
    let tokenCalls = 0;
    let popularityCalls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === APPLE_ADS_TOKEN_URL) {
        tokenCalls += 1;
        return Response.json({ access_token: `tok-${tokenCalls}`, expires_in: 3600 });
      }
      popularityCalls += 1;
      if (popularityCalls === 1) return new Response("nope", { status: 401 });
      return Response.json({ result: { rows: [{ searchTerm: "x", searchPopularity1to100: 44 }] } });
    });
    const rows = await queryPopularityRows(
      creds,
      buildTermsQuery({ country: "US", range: { start: "2026-09-20", end: "2026-09-26" } }),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(rows).toHaveLength(1);
    expect(tokenCalls).toBe(2);
    expect(popularityCalls).toBe(2);
  });

  it("surfaces Apple rate limiting as a 429 error", async () => {
    const creds = await generateTestCreds();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === APPLE_ADS_TOKEN_URL
        ? Response.json({ access_token: "tok", expires_in: 3600 })
        : new Response("slow down", { status: 429 }),
    );
    await expect(
      queryPopularityRows(
        creds,
        buildTermsQuery({ country: "US", range: { start: "2026-09-20", end: "2026-09-26" } }),
        { fetchImpl: fetchImpl as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ status: 429 });
  });
});

describe("shiftUtcWeek", () => {
  it("moves a Sun–Sat window back one week", () => {
    expect(shiftUtcWeek({ start: "2026-08-09", end: "2026-08-15" }, -1)).toEqual({
      start: "2026-08-02",
      end: "2026-08-08",
    });
  });
});

describe.skipIf(!process.env.LIVE_APPLE_ADS)("live Apple Ads", () => {
  it("mints a token and looks up meditation in US Health & Fitness", async () => {
    const { readFileSync } = await import("node:fs");
    const envPath = new URL("../../.env.local", import.meta.url);
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const eq = line.indexOf("=");
      const key = line.slice(0, eq);
      let val = line.slice(eq + 1);
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
    const creds = readAppleAdsCredentials(process.env);
    expect(creds).not.toBeNull();
    if (!creds) return;
    clearAppleAdsTokenCache();
    const token = await getAppleAdsAccessToken(creds);
    expect(token.length).toBeGreaterThan(20);
    const week = lastCompleteUtcWeek();
    const rows = await queryPopularityRows(
      creds,
      buildTermsQuery({ country: "US", range: week, terms: ["meditation"] }),
    );
    expect(Array.isArray(rows)).toBe(true);
    console.log("live popularity", rows[0] ?? { found: false });
  });
});
