import { NextRequest, NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { isAppEventName, isBotUserAgent, recordEvent } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";
  if (isBotUserAgent(userAgent)) {
    return new NextResponse(null, { status: 204 });
  }

  // Same admin opt-out as pageviews: founders testing must not pollute data.
  const optOutHeader = request.headers.get("x-admin-optout");
  const optOutCookie = request.cookies.get("appclimb_admin_optout")?.value;
  if (optOutHeader === "1" || optOutCookie === "1") {
    return new NextResponse(null, { status: 204 });
  }

  let body: {
    name?: string;
    path?: string;
    meta?: Record<string, string | number | boolean> | null;
    screenWidth?: number;
  } = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  if (!isAppEventName(body.name)) {
    return new NextResponse(null, { status: 204 });
  }

  const db = getDb();
  if (!db) {
    return new NextResponse(null, { status: 204 });
  }

  // Do not record events fired by authenticated admins.
  try {
    const session = await getCurrentSession(request, db);
    if (session && isAdminEmail(session.user.email)) {
      return new NextResponse(null, { status: 204 });
    }
  } catch {
    // Continue if session check fails.
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

  await recordEvent(db, {
    name: body.name,
    path: typeof body.path === "string" ? body.path : "/",
    userAgent,
    ip,
    country,
    screenWidth:
      typeof body.screenWidth === "number" ? body.screenWidth : undefined,
    meta:
      body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
        ? body.meta
        : null,
  });

  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  return new NextResponse(null, { status: 405 });
}
