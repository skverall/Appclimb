"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { MarketingShell } from "@/components/marketing-shell";

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
    <MarketingShell>
      <main className="legal-page">
        <span className="eyebrow">Unexpected interruption</span>
        <h1 ref={headingRef} tabIndex={-1}>
          AppClimb could not load this page.
        </h1>
        <p>
          Try loading again. If the problem persists, Apple&apos;s public
          catalog may be temporarily unavailable.
        </p>
        <div className="marketing-hero-actions">
          <button
            className="marketing-primary-action"
            type="button"
            onClick={unstable_retry}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Try loading again
          </button>
          <Link href="/" className="marketing-secondary-action">
            <AlertTriangle size={16} aria-hidden="true" /> Back to the explorer
          </Link>
        </div>
      </main>
    </MarketingShell>
  );
}
