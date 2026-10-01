import { NextRequest, NextResponse } from "next/server";

import { assistantDailyLimit, readAiUsage } from "@/lib/ai-usage";
import { getDb } from "@/lib/db";
import { resolveQuotaSubject } from "@/lib/quota";
import { searchTermDeps } from "@/lib/search-terms-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's assistant allowance, so the composer can show it before a send. */
export async function GET(request: NextRequest) {
  const db = getDb();
  const subject = await resolveQuotaSubject(request, db);
  const limit = assistantDailyLimit(subject.plan);
  const finiteLimit = Number.isFinite(limit) ? limit : null;
  let used: number | null = null;
  if (db && subject.isSignedIn) {
    try {
      used = await readAiUsage(db, subject.key);
    } catch {
      used = null;
    }
  }
  return NextResponse.json(
    {
      configured: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
      signedIn: subject.isSignedIn,
      limit: finiteLimit,
      used,
      remaining: finiteLimit !== null && used !== null ? Math.max(0, finiteLimit - used) : null,
      tools: Boolean(searchTermDeps()),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
