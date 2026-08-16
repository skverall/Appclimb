import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { clearSessionCookie, signOut } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const db = getDb();
  if (db) {
    await signOut(request, db);
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
