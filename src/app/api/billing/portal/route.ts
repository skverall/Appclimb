import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getSubscription } from "@/lib/entitlement";
import { paddleGet, readPaddleConfig } from "@/lib/paddle";
import { getCurrentSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PaddleSubscriptionApi {
  management_urls?: {
    update_payment_method?: string;
    cancel?: string;
  };
}

export async function GET(request: NextRequest) {
  const db = getDb();
  const config = readPaddleConfig();
  if (!db || !config) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const current = await getCurrentSession(request, db);
  if (!current) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const sub = await getSubscription(db, current.user.id);
  if (!sub || !sub.paddle_subscription_id) {
    return NextResponse.json({ error: "No active subscription." }, { status: 404 });
  }

  const res = await paddleGet<PaddleSubscriptionApi>(
    config,
    `/subscriptions/${encodeURIComponent(sub.paddle_subscription_id)}`,
  );
  if (!res.ok || !res.data) {
    return NextResponse.json({ error: "Could not load the subscription." }, { status: 502 });
  }

  return NextResponse.json({
    updatePaymentMethod: res.data.management_urls?.update_payment_method ?? null,
    cancel: res.data.management_urls?.cancel ?? null,
  });
}
