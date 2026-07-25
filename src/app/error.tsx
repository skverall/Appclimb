"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    console.error(error);
    headingRef.current?.focus();
  }, [error]);

  return (
    <main className="checkout-success-page">
      <section
        className="checkout-success-card"
        role="alert"
        aria-live="assertive"
        aria-labelledby="error-title"
      >
        <span className="checkout-success-icon" aria-hidden="true">
          <AlertTriangle size={28} />
        </span>
        <span className="eyebrow">Unexpected interruption</span>
        <h1 id="error-title" ref={headingRef} tabIndex={-1}>
          AppClimb could not load this view.
        </h1>
        <p>
          Try the view again. Source credentials are never displayed in this
          fallback. If a save was in progress, check the workspace before
          submitting it again.
        </p>
        <button
          className="auth-submit"
          type="button"
          onClick={unstable_retry}
        >
          <RotateCcw size={16} aria-hidden="true" />
          Try loading again
        </button>
        <div className="checkout-legal-links">
          <Link href="/">Return to River Atlas</Link>
        </div>
      </section>
    </main>
  );
}
