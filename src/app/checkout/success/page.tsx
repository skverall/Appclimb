import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock3 } from "lucide-react";
import { redirect } from "next/navigation";

import { AnalyticsConversion } from "@/components/analytics-conversion";
import { readBackend } from "@/lib/backend";
import { isBackendIdentity } from "@/lib/identity-schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plan status",
  robots: { index: false, follow: false },
};

interface IdentityEnvelope {
  data?: unknown;
}

export default async function CheckoutSuccessPage() {
  const response = await readBackend("/v1/me");
  if (!response?.ok) redirect("/login");

  const identity = ((await response.json()) as IdentityEnvelope).data;
  if (!isBackendIdentity(identity)) redirect("/login");

  const active =
    identity.subscriptionStatus.toLowerCase() === "active" ||
    identity.subscriptionStatus.toLowerCase() === "paid";

  return (
    <main className="checkout-success-page">
      {active && <AnalyticsConversion goal="paid_activated" />}
      <section className="checkout-success-card">
        <span className="checkout-success-icon">
          {active ? <CheckCircle2 size={30} /> : <Clock3 size={30} />}
        </span>
        <span className="eyebrow">
          {active ? "Entitlement confirmed" : "Plan verification"}
        </span>
        <h1>
          {active
            ? "AppClimb Pro is active"
            : "We are still confirming your plan"}
        </h1>
        <p>
          {active
            ? "Your workspace entitlement is active on the AppClimb server."
            : "This page cannot confirm a payment from its URL alone. Your workspace will update only after the signed billing webhook confirms the entitlement."}
        </p>
        <Link href="/">Return to your Growth River</Link>
        <small>
          {active
            ? `Signed in as ${identity.email}.`
            : "If you just completed checkout, return to the workspace and check again shortly."}
        </small>
        <nav className="checkout-legal-links" aria-label="Checkout legal links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/refunds">Refund policy</Link>
        </nav>
      </section>
    </main>
  );
}
