import { NextRequest, NextResponse } from "next/server";

import { bearerMatches } from "@/lib/bearer-secret";
import { getDb } from "@/lib/db";
import { purgeExpiredData } from "@/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Weekly data purge for the scheduled GitHub workflow (weekly-purge.yml),
 * enforcing the retention periods on /privacy (src/lib/retention.ts).
 * Bearer-protected with the same DIGEST_SECRET as the weekly email run.
 * Reports only row counts, since the workflow log is public.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.DIGEST_SECRET?.trim() ?? "";
  const db = getDb();
  if (!secret || !db) {
    return NextResponse.json({ error: "The purge is not configured." }, { status: 503 });
  }
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return NextResponse.json({ deleted: await purgeExpiredData(db) });
}
