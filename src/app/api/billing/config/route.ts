import { BILLING_PLANS } from "@/lib/billing";

export const dynamic = "force-static";

export async function GET() {
  return Response.json({
    trialDays: 14,
    requiresCardForTrial: false,
    plans: BILLING_PLANS,
    provider: "paddle",
  });
}
