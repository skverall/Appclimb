import { NextRequest, NextResponse } from "next/server";

import { deleteAccount } from "@/lib/account-deletion";
import { getDb } from "@/lib/db";
import { clearSessionCookie, getCurrentSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Delete the signed-in account and everything stored for it (src/lib/account-deletion.ts). */
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Accounts are not configured." }, { status: 503 });
  const current = await getCurrentSession(request, db);
  if (!current) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const result = await deleteAccount(db, current.user);
  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          "Your Pro subscription is still active. Cancel it under Manage subscription first, then delete the account.",
      },
      { status: 409 },
    );
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
