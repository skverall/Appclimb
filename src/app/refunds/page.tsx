import { MarketingShell } from "@/components/marketing-shell";

export const metadata = {
  title: "Refund policy",
  description:
    "AppClimb refund policy: a full refund of any Pro payment within 14 days, with no exceptions, via Paddle.",
  alternates: { canonical: "/refunds" },
};

export default function RefundPolicyPage() {
  return (
    <MarketingShell>
      <main className="legal-page">
        <span className="eyebrow">Legal</span>
        <h1>Refund policy</h1>
        <p className="legal-operator">
          AppClimb is owned and operated by its founder,{" "}
          <strong>Shokhabbos Makhmudov</strong>.
        </p>
        <p className="legal-updated">Last updated October 15, 2026</p>
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
            You can get a full refund of any Pro payment — the first payment
            or any renewal, monthly or yearly — if you ask within 14 days of
            that payment. You do not need to give a reason, and there are no
            exceptions.
          </p>
        </section>
        <section>
          <h2>How to request a refund</h2>
          <p>
            Ask Paddle directly at{" "}
            <a href="https://paddle.net">paddle.net</a> with the email from
            your receipt, or contact us via the GitHub repository linked on
            this site with your receipt details. Refunds are issued through
            Paddle to your original payment method; your bank may take 5–10
            business days to show the money back. A refund ends the Pro access
            paid for by that payment.
          </p>
        </section>
        <section>
          <h2>Canceling</h2>
          <p>
            You can cancel at any time from your account menu; Pro stays active
            until the end of the period you paid for. Canceling stops future
            renewals; to get money back for a payment, request a refund within
            14 days of that payment.
          </p>
        </section>
        <section>
          <h2>Your rights</h2>
          <p>
            This policy does not limit any rights you have under consumer
            protection law or under the{" "}
            <a href="https://www.paddle.com/legal/buyer-terms">
              Paddle Buyer Terms
            </a>
            .
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
