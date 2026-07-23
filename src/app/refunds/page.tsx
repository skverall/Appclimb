import Link from "next/link";

export const metadata = { title: "Refund policy" };

export default function RefundPolicyPage() {
  return (
    <main className="legal-page">
      <Link href="/">← AppClimb</Link>
      <span className="eyebrow">Legal</span>
      <h1>Refund policy</h1>
      <p className="legal-updated">Last updated July 23, 2026</p>
      <section>
        <h2>Requesting a refund</h2>
        <p>
          Contact support with the email used at checkout and the Paddle
          transaction reference. Eligible requests are reviewed according to
          applicable consumer law and Paddle&apos;s buyer terms.
        </p>
      </section>
      <section>
        <h2>Subscriptions</h2>
        <p>
          Canceling stops future renewals but does not automatically refund the
          current billing period. Approved refunds are returned to the original
          payment method.
        </p>
      </section>
      <section>
        <h2>Duplicate or incorrect charges</h2>
        <p>
          Duplicate charges and confirmed billing errors are corrected as soon
          as they are verified. Paddle may request additional transaction
          details to complete the review.
        </p>
      </section>
      <p className="legal-note">
        Refund eligibility may vary by country and applicable consumer law.
      </p>
    </main>
  );
}
