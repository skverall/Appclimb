import { NextRequest, NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { queryAnalyticsSummary } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database not configured yet." },
      { status: 503 },
    );
  }

  const session = await getCurrentSession(request, db);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!isAdminEmail(session.user.email)) {
    return NextResponse.json(
      { error: "Admin access denied." },
      { status: 403 },
    );
  }

  const rangeParam = request.nextUrl.searchParams.get("range");
  const range: "today" | "7d" | "30d" =
    rangeParam === "today" || rangeParam === "30d" ? rangeParam : "7d";

  try {
    const summary = await queryAnalyticsSummary(db, range);
    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    console.error("Failed to query analytics summary:", err);
    return NextResponse.json(
      { error: "Failed to load analytics data." },
      { status: 500 },
    );
  }
}
