// Server-only Apple Ads Platform API v1 client.
//
// Never import this from a client component. Credentials live in Worker
// secrets / .env.local and are used to mint a short-lived OAuth token, then
// query official search-term popularity.

import { createPrivateKey } from "node:crypto";

import {
  appleInsightsGenreCandidates,
  isAppleAdsGenre,
} from "@/lib/apple-ads-genres";
import type { OfficialPopularity } from "@/lib/popularity";

export const APPLE_ADS_TOKEN_URL =
  "https://appleid.apple.com/auth/oauth2/token";
export const APPLE_ADS_API_ORIGIN = "https://api.ads.apple.com";
export const APPLE_ADS_POPULARITY_PATH =
  "/v1/insights/apps/search-term-popularity/query";

export interface AppleAdsCredentials {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  adAccountId: string;
}

export interface AppleAdsEnv {
  APPLE_ADS_CLIENT_ID?: string;
  APPLE_ADS_TEAM_ID?: string;
  APPLE_ADS_KEY_ID?: string;
  APPLE_ADS_PRIVATE_KEY?: string;
  APPLE_ADS_ACCOUNT_ID?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

interface PopularityRow {
  searchTerm?: string;
  genre?: string;
  countryOrRegion?: string;
  rankInGenre?: number;
  searchPopularityInGenre?: number;
  searchPopularity1to100?: number;
  searchPopularity1to5?: number;
  week?: string;
}

let tokenCache: CachedToken | null = null;

export function readAppleAdsCredentials(
  env: AppleAdsEnv | NodeJS.ProcessEnv = process.env,
): AppleAdsCredentials | null {
  const clientId = env.APPLE_ADS_CLIENT_ID?.trim();
  const teamId = env.APPLE_ADS_TEAM_ID?.trim();
  const keyId = env.APPLE_ADS_KEY_ID?.trim();
  const privateKey = normalizePrivateKeyPem(env.APPLE_ADS_PRIVATE_KEY ?? "");
  const adAccountId = env.APPLE_ADS_ACCOUNT_ID?.trim();
  if (!clientId || !teamId || !keyId || !privateKey || !adAccountId) {
    return null;
  }
  return { clientId, teamId, keyId, privateKey, adAccountId };
}

export function normalizePrivateKeyPem(raw: string): string {
  const withNewlines = raw.trim().replace(/\\n/g, "\n");
  return withNewlines.replace(/\r\n/g, "\n").trim();
}

/** Apple Ads UI often downloads SEC1 (`EC PRIVATE KEY`). WebCrypto wants PKCS8. */
export function toPkcs8Pem(pem: string): string {
  const normalized = normalizePrivateKeyPem(pem);
  if (normalized.includes("BEGIN PRIVATE KEY")) return normalized;
  return createPrivateKey(normalized)
    .export({ type: "pkcs8", format: "pem" })
    .toString()
    .trim();
}

export function isoDateUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Last complete Sunday–Saturday week in UTC (Apple WEEKLY_SUN_SAT). */
export function shiftUtcWeek(
  week: { start: string; end: string },
  weeks: number,
): { start: string; end: string } {
  const start = new Date(`${week.start}T00:00:00Z`);
  const end = new Date(`${week.end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + weeks * 7);
  end.setUTCDate(end.getUTCDate() + weeks * 7);
  return { start: isoDateUtc(start), end: isoDateUtc(end) };
}

export function lastCompleteUtcWeek(now = new Date()): {
  start: string;
  end: string;
} {
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = utc.getUTCDay();
  const daysToLastSaturday = day === 6 ? 7 : day + 1;
  const end = new Date(utc);
  end.setUTCDate(end.getUTCDate() - daysToLastSaturday);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { start: isoDateUtc(start), end: isoDateUtc(end) };
}

function base64Url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = normalizePrivateKeyPem(pem)
    .replace(/-----[^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function importAppleAdsPrivateKey(
  pem: string,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<CryptoKey> {
  return subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(toPkcs8Pem(pem)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

export function buildClientSecretPayload(
  creds: Pick<AppleAdsCredentials, "clientId" | "teamId">,
  nowSec: number,
  lifetimeSec = 3600,
): { iss: string; sub: string; aud: string; iat: number; exp: number } {
  return {
    iss: creds.teamId,
    sub: creds.clientId,
    aud: "https://appleid.apple.com",
    iat: nowSec,
    exp: nowSec + lifetimeSec,
  };
}

export async function createClientSecretJwt(
  creds: AppleAdsCredentials,
  now = new Date(),
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  const nowSec = Math.floor(now.getTime() / 1000);
  const header = { alg: "ES256", kid: creds.keyId, typ: "JWT" };
  const payload = buildClientSecretPayload(creds, nowSec);
  const unsigned = `${encodeJson(header)}.${encodeJson(payload)}`;
  const key = await importAppleAdsPrivateKey(creds.privateKey, subtle);
  const signature = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64Url(signature)}`;
}

export function clearAppleAdsTokenCache(): void {
  tokenCache = null;
}

export async function getAppleAdsAccessToken(
  creds: AppleAdsCredentials,
  options: { fetchImpl?: typeof fetch; now?: Date; forceRefresh?: boolean } = {},
): Promise<string> {
  const now = options.now ?? new Date();
  if (
    !options.forceRefresh &&
    tokenCache &&
    tokenCache.expiresAt - 60_000 > now.getTime()
  ) {
    return tokenCache.token;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const jwt = await createClientSecretJwt(creds, now);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.clientId,
    client_secret: jwt,
    scope: "searchadsorg",
  });
  const response = await fetchImpl(APPLE_ADS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!response.ok) {
    throw new AppleAdsError(
      `token_${response.status}`,
      `Apple Ads token request failed (${response.status}).`,
      response.status,
    );
  }
  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  const token = payload.access_token?.trim();
  if (!token) {
    throw new AppleAdsError("token_empty", "Apple Ads token response was empty.");
  }
  const expiresIn = Number(payload.expires_in);
  const ttlMs = Number.isFinite(expiresIn)
    ? Math.max(60, expiresIn) * 1000
    : 50 * 60 * 1000;
  tokenCache = { token, expiresAt: now.getTime() + ttlMs };
  return token;
}

export class AppleAdsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = "AppleAdsError";
    this.code = code;
    this.status = status;
  }
}

export function buildPopularityQuery(input: {
  country: string;
  genre: string;
  week: { start: string; end: string };
  pageSize?: number;
}): Record<string, unknown> {
  return {
    fields: [
      "rankInGenre",
      "searchPopularityInGenre",
      "searchPopularity1to100",
      "searchPopularity1to5",
    ],
    filters: [
      { field: "countryOrRegion", operator: "EQUALS", value: input.country },
      { field: "genre", operator: "EQUALS", value: input.genre },
    ],
    timeRange: {
      start: input.week.start,
      end: input.week.end,
      granularity: "WEEKLY_SUN_SAT",
    },
    pagination: { offset: 0, pageSize: input.pageSize ?? 200 },
  };
}

function rowsFromPayload(payload: unknown): PopularityRow[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as {
    result?: { rows?: PopularityRow[] } | PopularityRow[];
    data?: { rows?: PopularityRow[] };
  };
  if (Array.isArray(root.result)) return root.result;
  if (root.result && Array.isArray(root.result.rows)) return root.result.rows;
  if (root.data && Array.isArray(root.data.rows)) return root.data.rows;
  return [];
}

function toOfficial(
  row: PopularityRow,
  week: { start: string; end: string },
): OfficialPopularity | null {
  const term = typeof row.searchTerm === "string" ? row.searchTerm.trim() : "";
  const score = Number(row.searchPopularity1to100);
  if (!term || !Number.isFinite(score)) return null;
  return {
    term,
    found: true,
    genre: typeof row.genre === "string" ? row.genre : undefined,
    searchPopularity1to100: Math.max(1, Math.min(100, Math.round(score))),
    searchPopularityInGenre:
      typeof row.searchPopularityInGenre === "number"
        ? row.searchPopularityInGenre
        : undefined,
    searchPopularity1to5:
      typeof row.searchPopularity1to5 === "number"
        ? row.searchPopularity1to5
        : undefined,
    rankInGenre:
      typeof row.rankInGenre === "number" ? row.rankInGenre : undefined,
    weekStart: typeof row.week === "string" ? row.week : week.start,
    weekEnd: week.end,
  };
}

async function postPopularityQuery(
  creds: AppleAdsCredentials,
  token: string,
  query: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<{ status: number; rows: PopularityRow[] }> {
  const response = await fetchImpl(
    `${APPLE_ADS_API_ORIGIN}${APPLE_ADS_POPULARITY_PATH}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-AP-Context": `adAccountId=${creds.adAccountId}`,
      },
      body: JSON.stringify(query),
    },
  );
  if (response.status === 401) {
    throw new AppleAdsError("unauthorized", "Apple Ads rejected the access token.", 401);
  }
  if (response.status === 429) {
    throw new AppleAdsError("rate_limited", "Apple Ads is rate-limiting requests.", 429);
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new AppleAdsError(
      `ads_${response.status}`,
      `Apple Ads popularity request failed (${response.status}). ${detail}`,
      response.status >= 400 && response.status < 500 ? response.status : 502,
    );
  }
  const payload = (await response.json()) as unknown;
  return { status: response.status, rows: rowsFromPayload(payload) };
}

export async function lookupSearchTermPopularity(
  creds: AppleAdsCredentials,
  input: {
    country: string;
    genre: string;
    terms: string[];
    now?: Date;
  },
  options: { fetchImpl?: typeof fetch } = {},
): Promise<OfficialPopularity[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const week = lastCompleteUtcWeek(input.now);
  const country = input.country.trim().toUpperCase();
  const terms = [...new Set(input.terms.map((term) => term.trim()).filter(Boolean))];
  if (terms.length === 0) return [];

  const genres = isAppleAdsGenre(input.genre)
    ? appleInsightsGenreCandidates(input.genre)
    : [input.genre];

  let token = await getAppleAdsAccessToken(creds, { fetchImpl, now: input.now });
  const found: OfficialPopularity[] = [];
  const remaining = new Set(terms.map((term) => term.toLocaleLowerCase()));
  let lastError: unknown;
  const weeks = [week, shiftUtcWeek(week, -1)];

  for (const genre of genres) {
    if (remaining.size === 0) break;
    for (const window of weeks) {
      if (remaining.size === 0) break;
      const query = buildPopularityQuery({
        country,
        genre,
        week: window,
        pageSize: 500,
      });
      let rows: PopularityRow[];
      try {
        ({ rows } = await postPopularityQuery(creds, token, query, fetchImpl));
        lastError = null;
      } catch (error) {
        if (error instanceof AppleAdsError && error.status === 401) {
          clearAppleAdsTokenCache();
          token = await getAppleAdsAccessToken(creds, {
            fetchImpl,
            now: input.now,
            forceRefresh: true,
          });
          ({ rows } = await postPopularityQuery(creds, token, query, fetchImpl));
          lastError = null;
        } else if (
          error instanceof AppleAdsError &&
          error.status >= 400 &&
          error.status < 500
        ) {
          lastError = error;
          continue;
        } else {
          throw error;
        }
      }
      for (const row of rows) {
        const official = toOfficial(row, window);
        if (!official) continue;
        const key = official.term.toLocaleLowerCase();
        if (!remaining.has(key)) continue;
        found.push({ ...official, genre: official.genre ?? genre });
        remaining.delete(key);
      }
      if (rows.length > 0) break;
    }
  }

  if (found.length === 0 && lastError) throw lastError;
  return found;
}
