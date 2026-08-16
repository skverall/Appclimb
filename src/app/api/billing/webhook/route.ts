import { NextRequest, NextResponse } from "next/server";

import { resolveSubscriptionOwner, upsertSubscription } from "@/lib/billing";
import { getDb } from "@/lib/db";
import {
  extractSubscriptionInfo,
  isProPrice,
  parsePaddleEvent,
  readPaddleConfig,
  verifyPaddleWebhookSignature,
} from "@/lib/paddle";
import type { PlanId } from "@/lib/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const config = readPaddleConfig();
  if (!config) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("paddle-signature") ?? "";
  const rawBody = await request.text();
  if (!signature || !rawBody) {
    return NextResponse.json({ error: "Missing signature or body." }, { status: 400 });
  }

  if (!verifyPaddleWebhookSignature(rawBody, signature, config.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const event = parsePaddleEvent(rawBody);
  if (!event) {
    return NextResponse.json({ error: "Invalid event payload." }, { status: 400 });
  }

  // Acknowledge events we do not act on.
  if (!event.event_type.startsWith("subscription.")) {
    return NextResponse.json({ ok: true, event_type: event.event_type, handled: false });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const info = extractSubscriptionInfo(event.data);
  if (!info) {
    return NextResponse.json({ error: "Subscription payload missing." }, { status: 400 });
  }

  const owner = await resolveSubscriptionOwner(db, info);
  if (!owner) {
    // Cannot attribute the subscription to a user; accept to stop retries but
    // flag it so the missing linkage is visible in logs.
    return NextResponse.json(
      { ok: true, event_type: event.event_type, handled: false, reason: "owner_not_found" },
      { status: 200 },
    );
  }

  const plan: PlanId = isProPrice(config, info.priceId) ? "pro" : "free";
  await upsertSubscription(db, owner, info, plan);

  return NextResponse.json({ ok: true, event_type: event.event_type, handled: true });
}
