import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getPlanForUser, getSubscription } from "@/lib/entitlement";
import { limitsForPlan, type PlanLimits } from "@/lib/plan";
import { getCurrentSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface MeResponse {
  configured: boolean;
  user: { id: string; email: string; name: string | null } | null;
  plan: "free" | "pro";
  limits: PlanLimits;
  subscription: {
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
}

export async function GET(request: NextRequest) {
  const db = getDb();
  if (!db) {
    const body: MeResponse = {
      configured: false,
      user: null,
      plan: "free",
      limits: limitsForPlan("free"),
      subscription: null,
    };
    return NextResponse.json(body);
  }

  const current = await getCurrentSession(request, db);
  if (!current) {
    const body: MeResponse = {
      configured: true,
      user: null,
      plan: "free",
      limits: limitsForPlan("free"),
      subscription: null,
    };
    return NextResponse.json(body);
  }

  const { user } = current;
  const plan = await getPlanForUser(db, user.id);
  const sub = await getSubscription(db, user.id);

  const body: MeResponse = {
    configured: true,
    user: { id: user.id, email: user.email, name: user.name },
    plan,
    limits: limitsForPlan(plan),
    subscription: sub
      ? {
          status: sub.status,
          current_period_end: sub.current_period_end,
          cancel_at_period_end: sub.cancel_at_period_end === 1,
        }
      : null,
  };
  return NextResponse.json(body);
}
