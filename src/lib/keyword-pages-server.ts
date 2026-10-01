// Server-only loader for the /keywords SEO pages.

import { cache } from "react";

import type { DatasetGenre } from "@/lib/search-terms";
import { buildKeywordPageData, type KeywordPageData } from "@/lib/keyword-pages";
import { searchTermDeps } from "@/lib/search-terms-server";
import { datasetWeeksBefore, latestDataset } from "@/lib/search-terms-store";

export type KeywordPageResult =
  | { status: "ok"; data: KeywordPageData }
  | { status: "empty" }
  | { status: "unavailable" };

/** Weeks back for the "rising" comparison (matches /api/terms/trending). */
const COMPARE_WEEKS = 4;

/** Deduped per request: generateMetadata and the page share one load. */
export const loadKeywordPage = cache(async function loadKeywordPage(
  country: string,
  genre: DatasetGenre | null,
): Promise<KeywordPageResult> {
  const deps = searchTermDeps();
  if (!deps) return { status: "unavailable" };
  try {
    const current = await latestDataset(deps, country);
    if (!current) return { status: "empty" };
    const previous = await datasetWeeksBefore(deps, current, COMPARE_WEEKS).catch(() => null);
    const data = buildKeywordPageData(current, previous, genre, {
      top: genre ? 100 : 50,
      movers: 15,
    });
    return data ? { status: "ok", data } : { status: "empty" };
  } catch (error) {
    console.error(
      "[keyword-pages] load failed:",
      error instanceof Error ? error.message : String(error),
    );
    return { status: "unavailable" };
  }
});
