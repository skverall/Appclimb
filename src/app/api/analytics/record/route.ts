import { NextRequest, NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { isBotUserAgent, recordPageview } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";
  if (isBotUserAgent(userAgent)) {
    return new NextResponse(null, { status: 204 });
  }

  // Check client-side admin opt-out header or cookie
  const optOutHeader = request.headers.get("x-admin-optout");
  const optOutCookie = request.cookies.get("appclimb_admin_optout")?.value;
  if (optOutHeader === "1" || optOutCookie === "1") {
    return new NextResponse(null, { status: 204 });
  }

  let body: { path?: string; referrer?: string | null; screenWidth?: number } = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    // If body fails to parse, ignore
    return new NextResponse(null, { status: 204 });
  }

  const path = typeof body.path === "string" ? body.path : "/";
  // Never record admin pages themselves or internal API endpoints
  if (path.startsWith("/admin") || path.startsWith("/api")) {
    return new NextResponse(null, { status: 204 });
  }

  const db = getDb();
  if (!db) {
    return new NextResponse(null, { status: 204 });
  }

  // Check if current user is an authenticated Admin
  try {
    const session = await getCurrentSession(request, db);
    if (session && isAdminEmail(session.user.email)) {
      // Do NOT record admin visits to avoid polluting real data
      return new NextResponse(null, { status: 204 });
    }
  } catch {
    // Continue if session check fails
  }

  const country =
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-country") ||
    "US";

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "127.0.0.1";

  await recordPageview(db, {
    path,
    referrer: body.referrer ?? null,
    userAgent,
    ip,
    country,
    screenWidth: typeof body.screenWidth === "number" ? body.screenWidth : undefined,
  });

  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  return new NextResponse(null, { status: 405 });
}
