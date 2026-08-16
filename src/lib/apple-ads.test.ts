import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APPLE_ADS_API_ORIGIN,
  APPLE_ADS_POPULARITY_PATH,
  APPLE_ADS_TOKEN_URL,
  buildClientSecretPayload,
  buildPopularityQuery,
  clearAppleAdsTokenCache,
  getAppleAdsAccessToken,
  lastCompleteUtcWeek,
  lookupSearchTermPopularity,
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

describe("buildPopularityQuery", () => {
  it("filters by country and genre and asks for popularity fields", () => {
    const query = buildPopularityQuery({
      country: "US",
      genre: "PRODUCTIVITY_UTILITIES",
      week: { start: "2026-08-02", end: "2026-08-08" },
    });
    expect(query).toMatchObject({
      timeRange: {
        start: "2026-08-02",
        end: "2026-08-08",
        granularity: "WEEKLY_SUN_SAT",
      },
    });
    expect(query.fields).toEqual(
      expect.arrayContaining(["searchPopularity1to100", "rankInGenre"]),
    );
    const filters = query.filters as Array<{ field: string; value: unknown }>;
    expect(filters).toEqual([
      { field: "countryOrRegion", operator: "EQUALS", value: "US" },
      { field: "genre", operator: "EQUALS", value: "PRODUCTIVITY_UTILITIES" },
    ]);
  });
});

describe("lookupSearchTermPopularity", () => {
  it("mints a token then returns official rows for matching terms", async () => {
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
                genre: "HEALTH_AND_FITNESS",
                searchPopularity1to100: 77,
                searchPopularityInGenre: 82,
                searchPopularity1to5: 4,
                rankInGenre: 6,
                week: "2026-08-09",
              },
            ],
          },
        });
      }
      throw new Error(`unexpected ${url}`);
    });

    const rows = await lookupSearchTermPopularity(
      creds,
      {
        country: "US",
        genre: "HEALTH_AND_FITNESS",
        terms: ["meditation"],
        now: new Date("2026-08-16T12:00:00Z"),
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(rows).toEqual([
      expect.objectContaining({
        term: "meditation",
        found: true,
        searchPopularity1to100: 77,
        genre: "HEALTH_AND_FITNESS",
      }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const cached = await getAppleAdsAccessToken(creds, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: new Date("2026-08-16T12:01:00Z"),
    });
    expect(cached).toBe("tok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries once after a 401 and skips empty weeks", async () => {
    const creds = await generateTestCreds();
    let tokenCalls = 0;
    let popularityCalls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === APPLE_ADS_TOKEN_URL) {
        tokenCalls += 1;
        return Response.json({
          access_token: tokenCalls === 1 ? "tok-old" : "tok-new",
          expires_in: 3600,
        });
      }
      popularityCalls += 1;
      if (popularityCalls === 1) {
        return new Response("nope", { status: 401 });
      }
      if (popularityCalls === 2) {
        return Response.json({ result: { rows: [] } });
      }
      return Response.json({
        result: {
          rows: [
            {
              searchTerm: "meditation",
              searchPopularity1to100: 40,
              genre: "HEALTH_FITNESS",
            },
          ],
        },
      });
    });
    const rows = await lookupSearchTermPopularity(
      creds,
      {
        country: "US",
        genre: "HEALTH_FITNESS",
        terms: ["meditation"],
        now: new Date("2026-08-16T12:00:00Z"),
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(rows[0]?.searchPopularity1to100).toBe(40);
    expect(tokenCalls).toBe(2);
    expect(popularityCalls).toBe(3);
  });

  it("returns no rows when Apple omits the term", async () => {
    const creds = await generateTestCreds();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === APPLE_ADS_TOKEN_URL) {
        return Response.json({ access_token: "tok", expires_in: 3600 });
      }
      return Response.json({
        result: {
          rows: [{ searchTerm: "other", searchPopularity1to100: 10 }],
        },
      });
    });
    const rows = await lookupSearchTermPopularity(
      creds,
      {
        country: "US",
        genre: "TRAVEL",
        terms: ["obscure phrase"],
        now: new Date("2026-08-16T12:00:00Z"),
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(rows).toEqual([]);
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
    const rows = await lookupSearchTermPopularity(creds, {
      country: "US",
      genre: "HEALTH_AND_FITNESS",
      terms: ["meditation"],
    });
    expect(Array.isArray(rows)).toBe(true);
    console.log(
      "live popularity",
      rows[0]
        ? {
            found: rows[0].found,
            score: rows[0].searchPopularity1to100,
            genre: rows[0].genre,
          }
        : { found: false },
    );
  });
});
