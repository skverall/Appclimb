import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { readDigestEnabled, writeDigestEnabled } from "@/lib/digest-server";
import { getCurrentSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function signedInUser(request: NextRequest) {
  const db = getDb();
  if (!db) return { error: NextResponse.json({ error: "Accounts are not configured." }, { status: 503 }) };
  const current = await getCurrentSession(request, db);
  if (!current) return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  return { db, userId: current.user.id };
}

/**
 * The signed-in user's weekly email setting. Every signed-in account gets the
 * email (ADR 0007): Pro about their own keywords, free about Apple's risers.
 */
export async function GET(request: NextRequest) {
  // Without accounts there is no setting to show; answer quietly, not 503.
  if (!getDb()) return NextResponse.json({ configured: false, enabled: null, eligible: false });
  const user = await signedInUser(request);
  if ("error" in user) return user.error;
  const enabled = await readDigestEnabled(user.db, user.userId);
  return NextResponse.json({ configured: true, enabled, eligible: true });
}

export async function POST(request: NextRequest) {
  const user = await signedInUser(request);
  if ("error" in user) return user.error;
  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "Send { enabled: true | false }." }, { status: 400 });
  }
  await writeDigestEnabled(user.db, user.userId, body.enabled);
  return NextResponse.json({ enabled: body.enabled });
}
