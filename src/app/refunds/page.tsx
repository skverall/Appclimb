import { MarketingShell } from "@/components/marketing-shell";

export const metadata = {
  title: "Refund policy",
  description:
    "AppClimb refund policy: how refunds for the Pro subscription work via Paddle.",
  alternates: { canonical: "/refunds" },
};

export default function RefundPolicyPage() {
  return (
    <MarketingShell>
      <main className="legal-page">
        <span className="eyebrow">Legal</span>
        <h1>Refund policy</h1>
        <p className="legal-updated">Last updated August 16, 2026</p>
        <section>
          <h2>The free plan costs nothing</h2>
          <p>
            The free plan has no subscription and collects no payment
            information, so no refund is ever needed for it.
          </p>
        </section>
        <section>
          <h2>Pro subscriptions</h2>
          <p>
            Pro subscriptions are billed by Paddle, the merchant of record.
            You can cancel at any time from your account menu; Pro stays active
            until the end of the period you paid for. We do not offer automatic
            refunds on cancelation.
          </p>
        </section>
        <section>
          <h2>How to request a refund</h2>
          <p>
            If you believe you are entitled to a refund — for example, a
            duplicate charge or an upgrade taken by mistake — contact us via
            the GitHub repository linked on this site within 14 days of the
            charge, with your receipt details. We will review each case and
            issue approved refunds through Paddle. Paddle&apos;s buyer
            protections and any applicable statutory rights remain unaffected.
          </p>
        </section>
        <section>
          <h2>If you were charged and do not recognize it</h2>
          <p>
            Charges from AppClimb appear on your statement as Paddle or
            Paddle.net. If you see a charge claiming to be AppClimb on any
            other processor, do not enter payment details there; report the
            unauthorized charge to your bank or payment provider.
          </p>
        </section>
      </main>
    </MarketingShell>
  );
}
