// Map public iTunes primaryGenreName values to Apple Ads Platform API
// genre tokens used by POST /v1/insights/apps/search-term-popularity/query.

/** Genre tokens accepted by Platform API v1 Insights (from a live 400). */
export const APPLE_ADS_GENRES = [
  "BOOKS",
  "BUSINESS",
  "DEVELOPER_TOOLS",
  "EDUCATION",
  "ENTERTAINMENT",
  "FINANCE",
  "FOOD_DRINK",
  "FOOD_AND_DRINK",
  "GAMES",
  "GRAPHICS_AND_DESIGN",
  "HEALTH_FITNESS",
  "HEALTH_AND_FITNESS",
  "KIDS",
  "LIFESTYLE",
  "NEW_PUBLICATION",
  "MAGAZINES_AND_NEWSPAPERS",
  "MEDICAL",
  "MUSIC",
  "NAVIGATION",
  "NEWS",
  "PHOTO_VIDEO",
  "PHOTO_AND_VIDEO",
  "PRODUCTIVITY_UTILITIES",
  "PRODUCTIVITY",
  "REFERENCE",
  "SHOPPING",
  "SOCIAL_NETWORKING",
  "SPORTS",
  "STICKERS",
  "TRAVEL",
  "UTILITIES",
  "WEATHER",
] as const;

export type AppleAdsGenre = (typeof APPLE_ADS_GENRES)[number];

const ITUNES_TO_APPLE: Record<string, AppleAdsGenre> = {
  book: "BOOKS",
  books: "BOOKS",
  business: "BUSINESS",
  "developer tools": "DEVELOPER_TOOLS",
  education: "EDUCATION",
  entertainment: "ENTERTAINMENT",
  finance: "FINANCE",
  "food & drink": "FOOD_DRINK",
  "food and drink": "FOOD_DRINK",
  games: "GAMES",
  "graphics & design": "GRAPHICS_AND_DESIGN",
  "graphics and design": "GRAPHICS_AND_DESIGN",
  "health & fitness": "HEALTH_FITNESS",
  "health and fitness": "HEALTH_FITNESS",
  kids: "KIDS",
  lifestyle: "LIFESTYLE",
  "magazines & newspapers": "NEW_PUBLICATION",
  "magazines and newspapers": "NEW_PUBLICATION",
  medical: "MEDICAL",
  music: "MUSIC",
  navigation: "NAVIGATION",
  news: "NEW_PUBLICATION",
  "photo & video": "PHOTO_VIDEO",
  "photo and video": "PHOTO_VIDEO",
  productivity: "PRODUCTIVITY_UTILITIES",
  utilities: "PRODUCTIVITY_UTILITIES",
  reference: "REFERENCE",
  shopping: "SHOPPING",
  "social networking": "SOCIAL_NETWORKING",
  sports: "SPORTS",
  stickers: "STICKERS",
  travel: "TRAVEL",
  weather: "WEATHER",
};

const GENRE_SET = new Set<string>(APPLE_ADS_GENRES);

export function isAppleAdsGenre(value: string): value is AppleAdsGenre {
  return GENRE_SET.has(value);
}

/** Normalize an iTunes genre name or an Ads token to an Ads token. */
export function mapItunesGenre(genre: string): AppleAdsGenre | null {
  const trimmed = genre.trim();
  if (!trimmed) return null;
  const mapped = ITUNES_TO_APPLE[trimmed.toLocaleLowerCase()];
  if (mapped) return mapped;
  const asToken = trimmed.toUpperCase().replace(/[\s&-]+/g, "_");
  if (isAppleAdsGenre(asToken)) return asToken;
  return null;
}

export interface GenreVote {
  genre: string;
}

/**
 * Pick the Apple Ads genre that appears most often in the top results.
 * Ties go to the earliest (higher-ranked) app.
 */
export function inferAppleGenre(apps: readonly GenreVote[]): AppleAdsGenre | null {
  const counts = new Map<AppleAdsGenre, { count: number; firstIndex: number }>();
  apps.forEach((app, index) => {
    const token = mapItunesGenre(app.genre);
    if (!token) return;
    const existing = counts.get(token);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(token, { count: 1, firstIndex: index });
    }
  });
  let best: AppleAdsGenre | null = null;
  let bestCount = 0;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const [genre, vote] of counts) {
    if (
      vote.count > bestCount ||
      (vote.count === bestCount && vote.firstIndex < bestIndex)
    ) {
      best = genre;
      bestCount = vote.count;
      bestIndex = vote.firstIndex;
    }
  }
  return best;
}

/** Alternate token Apple's wrappers sometimes emit for Health & Fitness. */
export function genreLookupAliases(genre: AppleAdsGenre): AppleAdsGenre[] {
  if (genre === "HEALTH_AND_FITNESS") return ["HEALTH_AND_FITNESS", "HEALTH_FITNESS"];
  if (genre === "HEALTH_FITNESS") return ["HEALTH_FITNESS", "HEALTH_AND_FITNESS"];
  return [genre];
}

/**
 * Tokens the live Insights endpoint has accepted. Docs use free-text
 * (`PRODUCTIVITY_UTILITIES`, `TRAVEL`); iTunes names are a fallback.
 */
export function appleInsightsGenreCandidates(genre: AppleAdsGenre): string[] {
  switch (genre) {
    case "PRODUCTIVITY":
    case "UTILITIES":
    case "PRODUCTIVITY_UTILITIES":
      return ["PRODUCTIVITY_UTILITIES"];
    case "HEALTH_AND_FITNESS":
    case "HEALTH_FITNESS":
      return ["HEALTH_FITNESS"];
    case "FOOD_AND_DRINK":
    case "FOOD_DRINK":
      return ["FOOD_DRINK"];
    case "PHOTO_AND_VIDEO":
    case "PHOTO_VIDEO":
      return ["PHOTO_VIDEO"];
    case "MAGAZINES_AND_NEWSPAPERS":
    case "NEWS":
    case "NEW_PUBLICATION":
      return ["NEW_PUBLICATION"];
    default:
      return [genre];
  }
}
