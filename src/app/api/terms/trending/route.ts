import { NextRequest, NextResponse } from "next/server";

import { isDatasetGenre, moversFrom } from "@/lib/search-terms";
import {
  notConfigured,
  parseCountry,
  searchTermDeps,
  TERMS_CACHE_HEADERS,
  termsRateLimited,
  upstreamError,
} from "@/lib/search-terms-server";
import { datasetWeeksBefore, latestDataset } from "@/lib/search-terms-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Comparison window for "rising": four published weeks back. */
const COMPARE_WEEKS = 4;

/**
 * Most searched, fastest rising, and newly published App Store search terms
 * for a storefront (optionally one genre), from Apple Ads Insights.
 */
export async function GET(request: NextRequest) {
  const limited = termsRateLimited(request);
  if (limited) return limited;
  const deps = searchTermDeps();
  if (!deps) return notConfigured();
  const params = request.nextUrl.searchParams;
  const country = parseCountry(params.get("country"));
  if (!country) {
    return NextResponse.json({ error: "Unsupported storefront." }, { status: 400 });
  }
  const rawGenre = params.get("genre");
  const genre = isDatasetGenre(rawGenre) ? rawGenre : null;
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 20));
  try {
    const current = await latestDataset(deps, country);
    if (!current) {
      return NextResponse.json({ configured: true, country, week: null, rising: [], newcomers: [], top: [] });
    }
    const previous = await datasetWeeksBefore(deps, current, COMPARE_WEEKS);
    const movers = moversFrom(current, previous, { genre, limit });
    return NextResponse.json(
      {
        configured: true,
        country,
        genre,
        week: current.week,
        compareWeek: previous?.week ?? null,
        termCount: genre
          ? current.rows.filter((row) => row.genre === genre).length
          : current.rows.length,
        ...movers,
      },
      { headers: TERMS_CACHE_HEADERS },
    );
  } catch (error) {
    return upstreamError(error);
  }
}
