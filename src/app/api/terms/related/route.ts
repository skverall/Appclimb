import { NextRequest, NextResponse } from "next/server";

import { relatedTermsFrom } from "@/lib/search-terms";
import {
  notConfigured,
  parseCountry,
  searchTermDeps,
  TERMS_CACHE_HEADERS,
  termsRateLimited,
  upstreamError,
} from "@/lib/search-terms-server";
import { latestDataset } from "@/lib/search-terms-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Published Apple search terms that share words with a keyword. */
export async function GET(request: NextRequest) {
  const limited = termsRateLimited(request);
  if (limited) return limited;
  const deps = searchTermDeps();
  if (!deps) return notConfigured();
  const country = parseCountry(request.nextUrl.searchParams.get("country"));
  const term = (request.nextUrl.searchParams.get("term") ?? "").trim().slice(0, 80);
  const genre = request.nextUrl.searchParams.get("genre");
  const limit = Math.min(30, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 12));
  if (!country || term.length < 2) {
    return NextResponse.json({ error: "A storefront and a term are required." }, { status: 400 });
  }
  try {
    const dataset = await latestDataset(deps, country);
    return NextResponse.json(
      {
        configured: true,
        country,
        week: dataset?.week ?? null,
        related: dataset ? relatedTermsFrom(dataset, term, limit, genre) : [],
      },
      { headers: TERMS_CACHE_HEADERS },
    );
  } catch (error) {
    return upstreamError(error);
  }
}
