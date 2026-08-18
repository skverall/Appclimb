// Shared iTunes Search API helpers.
//
// Apple blocks traffic from Cloudflare Workers IP ranges (403 / 429), so
// catalog search, app lookup, keyword rank checks, and metadata suggestions
// all run from the user's browser, which iTunes allows via
// `access-control-allow-origin: *`. These helpers keep the request shape and
// result cleaning identical to the previous server implementation so the
// contract does not drift.

export const ITUNES_ORIGIN = "https://itunes.apple.com";

/** Default timeout for Apple's public catalog, which can hang under load. */
export const ITUNES_TIMEOUT_MS = 15_000;

/**
 * Combine a caller-provided abort signal with a default timeout, so a hung
 * iTunes request cannot leave the UI in a permanent loading state.
 */
export function requestSignal(
  callerSignal?: AbortSignal,
  timeoutMs = ITUNES_TIMEOUT_MS,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
}

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

/**
 * iTunes `lang` parameter for a storefront. Localizes genre names, localized
 * titles, and related metadata in API responses so suggestions follow the
 * store's language. Falls back to a derived `xx_xx` code for unknown countries.
 */
const STOREFRONT_LANGS: Record<string, string> = {
  US: "en_us",
  GB: "en_gb",
  CA: "en_ca",
  AU: "en_au",
  IN: "en_in",
  DE: "de_de",
  FR: "fr_fr",
  IT: "it_it",
  ES: "es_es",
  NL: "nl_nl",
  SE: "sv_se",
  RU: "ru_ru",
  JP: "ja_jp",
  KR: "ko_kr",
  BR: "pt_br",
  MX: "es_mx",
};

export function storefrontLang(country: string): string {
  const code = boundedStorefront(country);
  return STOREFRONT_LANGS[code] ?? `${code.toLowerCase()}_${code.toLowerCase()}`;
}

/** Query iTunes `/search` and return cleaned app results. Throws on non-2xx. */
export async function searchAppStoreCatalog(
  query: string,
  country: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<CatalogApp[]> {
  const term = query.trim();
  if (term.length < 2 || term.length > 80) {
    throw new Error("invalid_app_search");
  }
  const storefront = boundedStorefront(country);
  const parameters = new URLSearchParams({
    term,
    country: storefront,
    lang: storefrontLang(storefront),
    media: "software",
    entity: "software",
    limit: "8",
    explicit: "No",
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${ITUNES_ORIGIN}/search?${parameters}`, {
    headers: { accept: "application/json" },
    signal: requestSignal(options.signal, options.timeoutMs),
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
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; limit?: number; timeoutMs?: number } = {},
): Promise<number | null> {
  const storefront = boundedStorefront(country);
  const parameters = new URLSearchParams({
    term: keyword,
    country: storefront,
    lang: storefrontLang(storefront),
    media: "software",
    entity: "software",
    limit: String(options.limit ?? 200),
    explicit: "No",
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${ITUNES_ORIGIN}/search?${parameters}`, {
    headers: { accept: "application/json" },
    signal: requestSignal(options.signal, options.timeoutMs),
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
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<AppStoreResult> {
  const storefront = boundedStorefront(country);
  const parameters = new URLSearchParams({
    id: appStoreId,
    country: storefront,
    lang: storefrontLang(storefront),
    entity: "software",
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${ITUNES_ORIGIN}/lookup?${parameters}`, {
    headers: { accept: "application/json" },
    signal: requestSignal(options.signal, options.timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`app_store_catalog_unavailable:${response.status}`);
  }
  const payload = (await response.json()) as { results?: AppStoreResult[] };
  return (Array.isArray(payload.results) ? payload.results : [])[0] ?? {};
}

const suggestionStopWords = new Set([
  "a",
  "an",
  "and",
  "app",
  "apps",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "get",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "our",
  "the",
  "this",
  "to",
  "with",
  "you",
  "your",
]);

export type SuggestionReason =
  | "App title"
  | "App description"
  | "App Store category"
  | "Related phrase"
  | "Competitor metadata"
  | "Store metadata";

export interface KeywordSuggestion {
  keyword: string;
  reason: SuggestionReason;
}

/**
 * Extract a numeric App Store ID from a bare id or apps.apple.com URL.
 * Accepts:
 * - "123456789"
 * - "https://apps.apple.com/us/app/name/id123456789"
 * - "apps.apple.com/.../id123456789?mt=8"
 */
export function parseAppStoreIdInput(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^\d{5,15}$/u.test(raw)) return raw;
  const fromUrl = raw.match(/(?:apps\.apple\.com|itunes\.apple\.com)\/[^\s]*?[\/?]id(\d{5,15})/iu);
  if (fromUrl?.[1]) return fromUrl[1];
  const bareId = raw.match(/\bid(\d{5,15})\b/iu);
  if (bareId?.[1]) return bareId[1];
  return null;
}

function normalizeSuggestionPhrase(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function isUsableSuggestion(phrase: string): boolean {
  if (phrase.length < 2 || phrase.length > 80) return false;
  const words = phrase.split(" ");
  if (words.every((word) => suggestionStopWords.has(word))) return false;
  // Drop pure single-character noise and numeric-only tokens under 3 digits.
  if (words.length === 1 && /^\d{1,2}$/u.test(words[0])) return false;
  return true;
}

function significantWords(text: string): string[] {
  return (
    text
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]{3,}/gu)
      ?.filter((word) => !suggestionStopWords.has(word)) ?? []
  );
}

/**
 * Derive keyword suggestions from app metadata. Returns up to `limit`
 * candidates (default 20) with an honest reason label for each.
 */
export function deriveKeywordSuggestions(
  raw: AppStoreResult,
  fallbackName: string,
  options: {
    limit?: number;
    competitorApps?: Array<Pick<CatalogApp, "name" | "genre">>;
  } = {},
): KeywordSuggestion[] {
  const limit = Math.min(20, Math.max(1, options.limit ?? 20));
  const title = normalizeSuggestionPhrase(
    String(raw.trackName ?? fallbackName),
  );
  const genre = normalizeSuggestionPhrase(String(raw.primaryGenreName ?? ""));
  const description = String(raw.description ?? "");
  const titleWords = significantWords(title);
  const descriptionWords = significantWords(description);
  const counts = new Map<string, number>();
  for (const word of descriptionWords) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  const ordered: KeywordSuggestion[] = [];
  const seen = new Set<string>();

  const push = (phrase: string, reason: SuggestionReason) => {
    const clean = normalizeSuggestionPhrase(phrase);
    if (!isUsableSuggestion(clean) || seen.has(clean)) return;
    seen.add(clean);
    ordered.push({ keyword: clean, reason });
  };

  if (title) push(title, "App title");
  for (const word of titleWords) push(word, "App title");
  if (genre) push(genre, "App Store category");

  // Title word + category combos (only when both are meaningful).
  if (genre) {
    for (const word of titleWords.slice(0, 4)) {
      if (word !== genre) push(`${word} ${genre}`, "Related phrase");
    }
  }

  // Adjacent 2–3 word phrases from the title.
  for (let index = 0; index < titleWords.length - 1; index += 1) {
    push(`${titleWords[index]} ${titleWords[index + 1]}`, "Related phrase");
    if (index < titleWords.length - 2) {
      push(
        `${titleWords[index]} ${titleWords[index + 1]} ${titleWords[index + 2]}`,
        "Related phrase",
      );
    }
  }

  // Frequent description words (appear more than once, or top-ranked).
  const rankedDescription = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12);
  for (const [word, count] of rankedDescription) {
    if (count >= 2 || rankedDescription.indexOf([word, count]) < 6) {
      push(word, "App description");
    }
  }

  // Competitor title words / genres when search results are already available.
  for (const competitor of options.competitorApps ?? []) {
    const competitorTitle = normalizeSuggestionPhrase(competitor.name);
    const competitorGenre = normalizeSuggestionPhrase(competitor.genre);
    if (competitorTitle && competitorTitle !== title) {
      const words = significantWords(competitorTitle).slice(0, 3);
      for (const word of words) push(word, "Competitor metadata");
      if (words.length >= 2) {
        push(`${words[0]} ${words[1]}`, "Competitor metadata");
      }
    }
    if (competitorGenre && competitorGenre !== genre) {
      push(competitorGenre, "Competitor metadata");
    }
  }

  return ordered.slice(0, limit);
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
    const res = await fetchFn(url, { signal: requestSignal() });
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: AppStoreResult[] };
    const result = body.results?.[0];
    return typeof result?.artworkUrl100 === "string" ? result.artworkUrl100 : null;
  } catch {
    return null;
  }
}

