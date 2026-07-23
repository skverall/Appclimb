import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default function CheckoutSuccessPage() {
  return (
    <main className="checkout-success-page">
      <section className="checkout-success-card">
        <span className="checkout-success-icon">
          <CheckCircle2 size={30} />
        </span>
        <span className="eyebrow">Payment received</span>
        <h1>AppClimb Pro is being activated</h1>
        <p>
          Paddle has confirmed the checkout. Your workspace entitlement will be
          updated by the signed billing webhook.
        </p>
        <Link href="/">Return to your Growth River</Link>
        <small>
          If the workspace still shows the trial state, refresh it in a few
          seconds.
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
