import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { limitsForPlan } from "@/lib/plan";
import {
  consumePopularityRate,
  emptyPopularityBucket,
  type PopularityRateBucket,
} from "@/lib/popularity-quota";
import type { OfficialPopularity } from "@/lib/popularity";
import {
  LEGACY_POPULARITY_DAILY,
  popularityDailyLimit,
  proQuotasEnabled,
  resolveQuotaSubject,
} from "@/lib/quota";
import { lookupTerm, normalizeTerm } from "@/lib/search-terms";
import {
  notConfigured,
  parseCountry,
  searchTermDeps,
  upstreamError,
} from "@/lib/search-terms-server";
import { HISTORY_WEEKS, latestDataset, termHistories } from "@/lib/search-terms-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 25;
const MAX_TERM_CHARS = 80;

const rateBuckets = new Map<string, PopularityRateBucket>();

interface LookupItem {
  term: string;
  genre?: string;
}

function parseItems(raw: unknown): LookupItem[] {
  if (!Array.isArray(raw)) return [];
  const items: LookupItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== "object") continue;
    const term =
      typeof (entry as { term?: unknown }).term === "string"
        ? (entry as { term: string }).term.trim()
        : "";
    const genre =
      typeof (entry as { genre?: unknown }).genre === "string"
        ? (entry as { genre: string }).genre.trim()
        : undefined;
    if (!term || term.length > MAX_TERM_CHARS) continue;
    const key = term.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ term, genre });
  }
  return items;
}

/**
 * Official Apple Ads popularity for up to 25 terms in one storefront.
 *
 * Found terms carry Apple's searchPopularity1to100 for the latest published
 * week. A term Apple does not publish (outside the top 500 of its genre)
 * returns `found: false` with `ceiling` — its popularity is at or below
 * that value. With `history: true`, each term also gets its real weekly
 * Apple history (12 weeks; 52 on Pro).
 */
export async function POST(request: NextRequest) {
  const deps = searchTermDeps();
  if (!deps) return notConfigured();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = body as { country?: unknown; items?: unknown; history?: unknown };
  const country = parseCountry(payload.country);
  if (!country) {
    return NextResponse.json({ error: "Unsupported storefront." }, { status: 400 });
  }
  const items = parseItems(payload.items);
  if (items.length === 0) {
    return NextResponse.json(
      { error: "At least one valid term is required." },
      { status: 400 },
    );
  }

  const now = Date.now();
  const subject = await resolveQuotaSubject(request, getDb());
  const quotas = proQuotasEnabled();
  const maxPerDay = quotas ? popularityDailyLimit(subject.plan) : LEGACY_POPULARITY_DAILY;
  const existing = rateBuckets.get(subject.key) ?? emptyPopularityBucket(now);
  const rate = consumePopularityRate(existing, now, maxPerDay);
  rateBuckets.set(subject.key, rate.bucket);
  if (rateBuckets.size > 5_000) {
    const first = rateBuckets.keys().next().value;
    if (first) rateBuckets.delete(first);
  }
  if (!rate.ok) {
    return NextResponse.json(
      { error: rate.reason ?? "Rate limited.", configured: true, retryAfterSec: rate.retryAfterSec },
      { status: 429 },
    );
  }

  const historyWeeks = quotas ? limitsForPlan(subject.plan).historyWeeks : HISTORY_WEEKS;

  try {
    const dataset = await latestDataset(deps, country);
    if (!dataset) {
      return NextResponse.json({ configured: true, country, results: [] });
    }
    const histories =
      payload.history === true
        ? await termHistories(
            deps,
            dataset,
            items.map((item) => item.term),
          )
        : null;

    const results: OfficialPopularity[] = items.map((item) => {
      const hit = lookupTerm(dataset, item.term, item.genre);
      const history = histories?.get(normalizeTerm(item.term));
      const trimmedHistory = history ? history.slice(-historyWeeks) : undefined;
      if (hit.found && hit.row) {
        return {
          term: item.term,
          found: true,
          genre: hit.row.genre,
          searchPopularity1to100: hit.row.popularity,
          searchPopularityInGenre: hit.row.popularityInGenre,
          searchPopularity1to5: hit.row.popularity1to5,
          rankInGenre: hit.row.rankInGenre,
          weekStart: dataset.week,
          history: trimmedHistory,
        };
      }
      return {
        term: item.term,
        found: false,
        genre: hit.ceilingGenre,
        ceiling: hit.ceiling,
        weekStart: dataset.week,
        history: trimmedHistory,
      };
    });

    return NextResponse.json({
      configured: true,
      country,
      week: dataset.week,
      historyWeeks,
      results,
    });
  } catch (error) {
    return upstreamError(error);
  }
}
