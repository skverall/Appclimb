// Server-only loader for the /keywords SEO pages.

import { cache } from "react";

import { normalizeTerm, type DatasetGenre } from "@/lib/search-terms";
import {
  buildKeywordPageData,
  buildTermPageData,
  decodeTermSlug,
  historyNeighbors,
  resolveTermSlug,
  termSlug,
  type KeywordPageData,
  type TermPageData,
} from "@/lib/keyword-pages";
import { searchTermDeps } from "@/lib/search-terms-server";
import { datasetWeeksBefore, latestDataset, termHistories } from "@/lib/search-terms-store";

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

export type TermPageResult =
  | { status: "ok"; data: TermPageData }
  | { status: "redirect"; genre: DatasetGenre; term: string }
  | { status: "missing" }
  | { status: "unavailable" };

/** How long a page waits on Apple for a term's history before rendering without it. */
const HISTORY_WAIT_MS = 4500;

/**
 * One published term's page. History comes from D1 when stored; otherwise
 * one Apple call loads it together with its category neighbours, so later
 * term pages in that category render from D1.
 */
export const loadTermPage = cache(async function loadTermPage(
  country: string,
  genre: DatasetGenre,
  slug: string,
): Promise<TermPageResult> {
  const deps = searchTermDeps();
  if (!deps) return { status: "unavailable" };
  try {
    const current = await latestDataset(deps, country);
    if (!current) return { status: "unavailable" };
    const resolved = resolveTermSlug(current, genre, slug);
    if (resolved.kind === "missing") return { status: "missing" };
    const { row, primaryGenre } = resolved;
    if (primaryGenre !== genre || termSlug(row.term) !== decodeTermSlug(slug)) {
      const canonical = current.rows.find(
        (item) => item.genre === primaryGenre && termSlug(item.term) === termSlug(row.term),
      );
      return { status: "redirect", genre: primaryGenre, term: canonical?.term ?? row.term };
    }
    const key = normalizeTerm(row.term);
    let history = (await termHistories(deps, current, [row.term], { live: false })).get(key);
    if (!history) {
      const terms = [row.term, ...historyNeighbors(current, row)];
      const loaded = await Promise.race([
        termHistories(deps, current, terms).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), HISTORY_WAIT_MS)),
      ]);
      history = loaded?.get(key);
    }
    const previous = await datasetWeeksBefore(deps, current, COMPARE_WEEKS).catch(() => null);
    return { status: "ok", data: buildTermPageData(current, previous, row, history ?? []) };
  } catch (error) {
    console.error(
      "[keyword-pages] term load failed:",
      error instanceof Error ? error.message : String(error),
    );
    return { status: "unavailable" };
  }
});
