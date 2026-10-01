import { NextRequest, NextResponse } from "next/server";

import { suggestTermsFrom } from "@/lib/search-terms";
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

/** Autocomplete from Apple's published search terms for one storefront. */
export async function GET(request: NextRequest) {
  const limited = termsRateLimited(request);
  if (limited) return limited;
  const deps = searchTermDeps();
  if (!deps) return notConfigured();
  const country = parseCountry(request.nextUrl.searchParams.get("country"));
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (!country) {
    return NextResponse.json({ error: "Unsupported storefront." }, { status: 400 });
  }
  if (query.length < 2) {
    return NextResponse.json({ configured: true, country, suggestions: [] });
  }
  try {
    const dataset = await latestDataset(deps, country);
    return NextResponse.json(
      {
        configured: true,
        country,
        week: dataset?.week ?? null,
        suggestions: dataset ? suggestTermsFrom(dataset, query, 8) : [],
      },
      { headers: TERMS_CACHE_HEADERS },
    );
  } catch (error) {
    return upstreamError(error);
  }
}
