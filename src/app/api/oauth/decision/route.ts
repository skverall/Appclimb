import { NextRequest, NextResponse } from "next/server";

import {
  approveAuthorizationRequest,
  denyAuthorizationRequest,
  getAuthorizationRequest,
} from "@/lib/agent-auth";
import { getDb } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The consent page's Allow / Cancel. Returns the client redirect as JSON so
 * the page navigates there itself: a form POST that redirects to another
 * origin would be blocked by the site's `form-action 'self'` policy.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Accounts are not configured." }, { status: 503 });
  const current = await getCurrentSession(request, db);
  if (!current) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { request?: unknown; approve?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const pending = await getAuthorizationRequest(db, typeof body.request === "string" ? body.request : "");
  if (!pending) {
    return NextResponse.json(
      { error: "This connection request expired. Start connecting again from your AI app." },
      { status: 410 },
    );
  }
  const redirect =
    body.approve === true
      ? await approveAuthorizationRequest(db, pending, current.user.id, request.nextUrl.origin)
      : await denyAuthorizationRequest(db, pending, request.nextUrl.origin);
  if (!redirect) {
    return NextResponse.json({ error: "This connection request was already answered." }, { status: 409 });
  }
  return NextResponse.json({ redirect });
}
