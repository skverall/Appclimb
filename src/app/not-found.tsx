import { Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="checkout-success-page">
      <section
        className="checkout-success-card"
        aria-labelledby="not-found-title"
      >
        <span className="checkout-success-icon" aria-hidden="true">
          <Compass size={28} />
        </span>
        <span className="eyebrow">404 · Outside the atlas</span>
        <h1 id="not-found-title">This route is not on the map.</h1>
        <p>
          The address may be outdated or mistyped. Nothing was changed, and you
          can return safely to the interactive River Atlas demo.
        </p>
        <Link href="/">Return to River Atlas</Link>
        <div className="checkout-legal-links">
          <Link href="/pricing">View early-access pricing</Link>
        </div>
      </section>
    </main>
  );
}
