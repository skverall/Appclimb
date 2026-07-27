// Shared iTunes Search API helpers.
//
// Apple blocks traffic from Cloudflare Workers IP ranges (403 / 429), so
// catalog search, app lookup, keyword rank checks, and metadata suggestions
// all run from the user's browser, which iTunes allows via
// `access-control-allow-origin: *`. These helpers keep the request shape and
// result cleaning identical to the previous server implementation so the
// contract does not drift.

export const ITUNES_ORIGIN = "https://itunes.apple.com";

export interface AppStoreResult {
  trackId?: number;
  trackName?: string;
  bundleId?: string;
  sellerName?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  description?: string;
}

export interface CatalogApp {
  appStoreId: string;
  name: string;
  bundleId: string;
  developer: string;
  genre: string;
  iconUrl: string;
  storeUrl: string;
}

/**
 * Normalize a raw iTunes result into the shape AppClimb stores and displays.
 * Returns null for entries lacking a usable id or name. Bounds every string
 * field to its column limit so a hostile catalog payload cannot overflow D1.
 */
export function cleanSearchResult(result: AppStoreResult): CatalogApp | null {
  const appStoreId = Number(result.trackId);
  const name = typeof result.trackName === "string" ? result.trackName.trim() : "";
  if (!Number.isInteger(appStoreId) || appStoreId <= 0 || !name) return null;
  return {
    appStoreId: String(appStoreId),
    name: name.slice(0, 120),
    bundleId:
      typeof result.bundleId === "string" ? result.bundleId.slice(0, 255) : "",
    developer:
      typeof result.sellerName === "string" ? result.sellerName.slice(0, 160) : "",
    genre:
      typeof result.primaryGenreName === "string"
        ? result.primaryGenreName.slice(0, 80)
        : "",
    iconUrl:
      typeof result.artworkUrl100 === "string" ? result.artworkUrl100 : "",
    storeUrl:
      typeof result.trackViewUrl === "string" ? result.trackViewUrl : "",
  };
}

const storefrontPattern = /^[A-Z]{2}$/u;

export function boundedStorefront(value: string): string {
  const storefront = value.trim().toUpperCase();
  if (!storefrontPattern.test(storefront)) {
    throw new Error("invalid_storefront");
  }
  return storefront;
}

/** Query iTunes `/search` and return cleaned app results. Throws on non-2xx. */
export async function searchAppStoreCatalog(
  query: string,
  country: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<CatalogApp[]> {
  const term = query.trim();
  if (term.length < 2 || term.length > 80) {
    throw new Error("invalid_app_search");
  }
  const storefront = boundedStorefront(country);
  const parameters = new URLSearchParams({
    term,
    country: storefront,
    media: "software",
    entity: "software",
    limit: "8",
    explicit: "No",
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${ITUNES_ORIGIN}/search?${parameters}`, {
    headers: { accept: "application/json" },
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`app_store_catalog_unavailable:${response.status}`);
  }
  const payload = (await response.json()) as { results?: AppStoreResult[] };
  return (Array.isArray(payload.results) ? payload.results : [])
    .map((result) => cleanSearchResult(result))
    .filter((result): result is CatalogApp => result !== null);
}

/**
 * Query iTunes `/search` for keyword rank position. Returns a 1-based position
 * of `appStoreId` in the result list, or null when the app is not in the first
 * `limit` results.
 */
export async function keywordRankPosition(
  keyword: string,
  country: string,
  appStoreId: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; limit?: number } = {},
): Promise<number | null> {
  const storefront = boundedStorefront(country);
  const parameters = new URLSearchParams({
    term: keyword,
    country: storefront,
    media: "software",
    entity: "software",
    limit: String(options.limit ?? 200),
    explicit: "No",
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${ITUNES_ORIGIN}/search?${parameters}`, {
    headers: { accept: "application/json" },
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`app_store_catalog_unavailable:${response.status}`);
  }
  const payload = (await response.json()) as { results?: AppStoreResult[] };
  const results = Array.isArray(payload.results) ? payload.results : [];
  const index = results.findIndex(
    (result) => String(result.trackId ?? "") === appStoreId,
  );
  return index >= 0 ? index + 1 : null;
}

/** Fetch the raw iTunes `/lookup` payload for one app id. Throws on non-2xx. */
export async function lookupAppStoreApp(
  appStoreId: string,
  country: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<AppStoreResult> {
  const storefront = boundedStorefront(country);
  const parameters = new URLSearchParams({
    id: appStoreId,
    country: storefront,
    entity: "software",
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${ITUNES_ORIGIN}/lookup?${parameters}`, {
    headers: { accept: "application/json" },
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`app_store_catalog_unavailable:${response.status}`);
  }
  const payload = (await response.json()) as { results?: AppStoreResult[] };
  return (Array.isArray(payload.results) ? payload.results : [])[0] ?? {};
}

const suggestionStopWords = new Set([
  "and",
  "app",
  "for",
  "from",
  "get",
  "in",
  "is",
  "of",
  "on",
  "the",
  "to",
  "with",
  "your",
]);

/**
 * Derive keyword suggestions from app metadata, mirroring the previous server
 * `keywordSuggestions` logic. Returns up to 8 candidates with their reason.
 */
export function deriveKeywordSuggestions(
  raw: AppStoreResult,
  fallbackName: string,
): { keyword: string; reason: string }[] {
  const title = String(raw.trackName ?? fallbackName).toLocaleLowerCase();
  const genre = String(raw.primaryGenreName ?? "").toLocaleLowerCase();
  const words = `${title} ${String(raw.description ?? "")}`
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]{3,}/gu)
    ?.filter((word) => !suggestionStopWords.has(word)) ?? [];
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  const candidates = [
    title,
    genre,
    ...title.split(/\s+/u).map((word) => `${word} ${genre}`.trim()),
    ...[...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12)
      .map(([word]) => word),
  ]
    .map((value) => value.trim().replace(/\s+/gu, " "))
    .filter(
      (value, index, values) =>
        value.length >= 3 &&
        value.length <= 80 &&
        values.indexOf(value) === index,
    )
    .slice(0, 8);
  return candidates.map((keyword, index) => ({
    keyword,
    reason:
      index === 0
        ? "App title"
        : keyword === genre
          ? "App Store category"
          : "Store metadata",
  }));
}

/**
 * Look up an app by its App Store ID and return its 100x100 artwork URL.
 */
export async function lookupAppStoreIcon(
  appStoreId: string,
  country = "US",
  options: { fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
  const cleanId = appStoreId.replace(/\D/gu, "");
  if (!cleanId) return null;
  const fetchFn = options.fetchImpl || fetch;
  const url = `${ITUNES_ORIGIN}/lookup?id=${cleanId}&country=${encodeURIComponent(country)}`;
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: AppStoreResult[] };
    const result = body.results?.[0];
    return typeof result?.artworkUrl100 === "string" ? result.artworkUrl100 : null;
  } catch {
    return null;
  }
}

