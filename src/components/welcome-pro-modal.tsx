"use client";

import { useEffect, useId, useRef } from "react";
import { ArrowRight, BadgeCheck, CalendarRange, Cloud, Infinity as InfinityIcon, LayoutGrid, Loader2, X } from "lucide-react";

import { useModalFocus } from "@/components/use-modal-focus";
import { PLAN_LIMITS } from "@/lib/plan";

export type WelcomeProStatus = "activating" | "active" | "delayed";

const pro = PLAN_LIMITS.pro;

const UNLOCKED = [
  { icon: InfinityIcon, title: "Unlimited checks", body: "Research as many new keywords as you like." },
  { icon: CalendarRange, title: `${pro.historyWeeks} weeks of history`, body: "Apple’s weekly popularity, a full year back." },
  { icon: LayoutGrid, title: "Every app, every keyword", body: `No caps in My Apps, ${pro.historyDays} days of ranks.` },
  { icon: Cloud, title: "Cloud sync", body: "The same workspace on every device you sign in." },
];

/**
 * Shown when Paddle sends the buyer back with `?checkout=success`. The webhook
 * can land a few seconds after the redirect, so the dialog reports activation
 * honestly instead of claiming Pro before the account says so.
 */
export function WelcomeProModal({
  open,
  status,
  email,
  onClose,
}: {
  open: boolean;
  status: WelcomeProStatus;
  email: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  useModalFocus(open, modalRef);

  // Land focus on the main action rather than the close button.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => ctaRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="upgrade-backdrop" role="presentation" onClick={onClose}>
      <div
        className="welcome-pro"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="upgrade-close" onClick={onClose} aria-label="Close welcome to Pro dialog">
          <X size={18} aria-hidden="true" />
        </button>

        <header className="welcome-pro-head">
          <span className="welcome-pro-burst" aria-hidden="true">
            <BadgeCheck size={30} />
            {Array.from({ length: 8 }, (_, index) => (
              <span key={index} style={{ ["--i" as string]: index }} />
            ))}
          </span>
          <p className="upgrade-eyebrow">Payment received</p>
          <h2 id={titleId}>Welcome to AppClimb Pro</h2>
          <p className={`welcome-pro-status is-${status}`} role="status" aria-live="polite">
            {status === "activating" && (
              <>
                <Loader2 className="spin" size={14} aria-hidden="true" /> Activating your plan…
              </>
            )}
            {status === "active" && (
              <>
                <BadgeCheck size={14} aria-hidden="true" /> Pro is active{email ? ` for ${email}` : ""}
              </>
            )}
            {status === "delayed" && (
              <>
                Activation is taking longer than usual. Your payment is safe —{" "}
                <button type="button" onClick={() => window.location.reload()}>
                  reload in a minute
                </button>
                .
              </>
            )}
          </p>
        </header>

        <div className="welcome-pro-body">
          <p className="upgrade-list-label">Unlocked for you</p>
          <ul className="welcome-pro-grid">
            {UNLOCKED.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title}>
                  <span className="upgrade-feature-icon" aria-hidden="true">
                    <Icon size={15} />
                  </span>
                  <span className="welcome-pro-item">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="welcome-pro-note">
            Pro includes a weekly email with what moved for your tracked keywords — on by default. Switch it off or
            manage billing from the account menu. Paddle has emailed your receipt.
          </p>
          <button type="button" className="upgrade-cta" onClick={onClose} ref={ctaRef}>
            Start using Pro <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
