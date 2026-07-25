import Link from "next/link";

export const metadata = {
  title: "Refund policy",
  description: "AppClimb refund policy for subscriptions billed by Paddle.",
  alternates: { canonical: "/refunds" },
};

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
          Open{" "}
          <a
            href="https://paddle.net/contact"
            target="_blank"
            rel="noreferrer"
          >
            Paddle buyer support
          </a>{" "}
          and choose <strong>Request refund</strong>. Use the email from
          checkout and your Paddle transaction reference so the purchase can
          be located. Eligibility is reviewed under applicable consumer law
          and Paddle&apos;s buyer terms.
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
          Report duplicate or unrecognized charges through the same Paddle
          buyer-support page. Paddle may request additional transaction details
          to verify and resolve the charge.
        </p>
      </section>
      <p className="legal-note">
        Refund eligibility may vary by country and applicable consumer law.
      </p>
    </main>
  );
}
