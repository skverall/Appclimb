"use client";

import { useEffect, useId, useRef } from "react";
import { CloudUpload, ListPlus, Plus, Search, X } from "lucide-react";

import { useModalFocus } from "@/components/use-modal-focus";

export function OnboardingModal({
  open,
  isPro,
  onAddApp,
  onClose,
}: {
  open: boolean;
  isPro: boolean;
  /** Start the add-app flow (and dismiss the wizard). */
  onAddApp: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocus(open, modalRef);

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
    <div className="tracker-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="tracker-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tracker-modal-header">
          <div>
            <h2 id={titleId}>Welcome to AppClimb</h2>
            <p>You&apos;re signed in. Here&apos;s the fastest way to value.</p>
          </div>
          <button
            type="button"
            className="tracker-icon-button"
            onClick={onClose}
            aria-label="Close welcome dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="tracker-modal-body onboarding-modal-body">
          <ol className="onboarding-wizard-steps">
            <li>
              <span className="onboarding-wizard-icon">
                <Plus size={15} aria-hidden="true" />
              </span>
              <div>
                <strong>Add your app</strong>
                <span>By name, App Store URL, or numeric App Store ID.</span>
              </div>
            </li>
            <li>
              <span className="onboarding-wizard-icon">
                <ListPlus size={15} aria-hidden="true" />
              </span>
              <div>
                <strong>Pick keywords</strong>
                <span>Take the metadata suggestions or paste your own list.</span>
              </div>
            </li>
            <li>
              <span className="onboarding-wizard-icon">
                <Search size={15} aria-hidden="true" />
              </span>
              <div>
                <strong>Watch position &amp; scores</strong>
                <span>
                  Official Apple Ads popularity, estimated difficulty, and rank in
                  the first 200 public results.
                </span>
              </div>
            </li>
          </ol>

          {isPro ? (
            <p className="onboarding-sync-note">
              <CloudUpload size={15} aria-hidden="true" />
              Cloud sync is on — your apps and keywords now follow you across
              devices.
            </p>
          ) : (
            <p className="onboarding-sync-note">
              <CloudUpload size={15} aria-hidden="true" />
              Your data stays in this browser. Upgrade to Pro to sync it across
              devices.
            </p>
          )}

          <div className="onboarding-wizard-actions">
            <button type="button" className="tracker-button-primary" onClick={onAddApp}>
              <Plus size={15} aria-hidden="true" /> Add your first app
            </button>
            <button type="button" className="tracker-button-secondary" onClick={onClose}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
