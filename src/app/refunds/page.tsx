import { MarketingShell } from "@/components/marketing-shell";

export const metadata = {
  title: "Refund policy",
  description:
    "AppClimb is free — there is nothing to refund. This page explains why no payment is ever required.",
  alternates: { canonical: "/refunds" },
};

export default function RefundPolicyPage() {
  return (
    <MarketingShell>
      <main className="legal-page">
        <span className="eyebrow">Legal</span>
        <h1>Refund policy</h1>
        <p className="legal-updated">Last updated August 2, 2026</p>
        <section>
          <h2>There is nothing to pay for</h2>
          <p>
            AppClimb is completely free. There is no subscription, no trial,
            no in-app purchase, and no payment processing on this site.
          </p>
        </section>
        <section>
          <h2>Why this page exists</h2>
          <p>
            Refund policies are a standard part of app and service websites.
            Because AppClimb never charges you anything, no refund can ever be
            owed or requested — and no payment information is ever collected.
          </p>
        </section>
        <section>
          <h2>If you believe you were charged</h2>
          <p>
            Any charge you do not recognize is not from AppClimb. Do not enter
            payment details anywhere claiming to be AppClimb; report the
            unauthorized charge to your bank or payment provider.
          </p>
        </section>
      </main>
    </MarketingShell>
  );
}
