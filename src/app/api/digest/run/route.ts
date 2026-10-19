import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { previewFreeDigest, runWeeklyDigest } from "@/lib/digest-server";
import { readResendCredentials } from "@/lib/email";
import { searchTermDeps } from "@/lib/search-terms-server";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Constant-time compare for the cron bearer token. */
function sameToken(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

/**
 * Weekly digest trigger for the scheduled GitHub workflow. Bearer-protected
 * with DIGEST_SECRET; handles a batch per call and reports `remaining`.
 * `dry=1` builds without sending or logging and reports counts only (the
 * workflow log is public). `preview=free` returns this week's free email
 * with a placeholder unsubscribe link, plus the Apple data behind it, so it
 * can be read before it goes out; it holds no user data and the workflow
 * never calls it.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.DIGEST_SECRET?.trim() ?? "";
  const db = getDb();
  if (!secret || !db) {
    return NextResponse.json({ error: "The weekly digest is not configured." }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (!sameToken(auth.replace(/^Bearer\s+/iu, ""), secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const params = request.nextUrl.searchParams;
  if (params.get("preview") === "free") {
    return NextResponse.json(await previewFreeDigest({ store: searchTermDeps(), siteUrl: SITE_URL }));
  }
  const dryRun = params.get("dry") === "1";
  const resend = readResendCredentials();
  if (!resend && !dryRun) {
    return NextResponse.json({ error: "Email is not configured." }, { status: 503 });
  }
  const result = await runWeeklyDigest({
    db,
    store: searchTermDeps(),
    resend,
    secret,
    siteUrl: SITE_URL,
    limit: Number(params.get("limit")) || 10,
    dryRun,
  });
  return NextResponse.json(result);
}
