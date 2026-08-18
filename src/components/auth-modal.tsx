"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Mail, X } from "lucide-react";

import { useModalFocus } from "@/components/use-modal-focus";
import { requestMagicLink } from "@/lib/account";
import { AUTH_COPY, type AuthIntent } from "@/lib/access";

export function AuthModal({
  open,
  intent = "default",
  onClose,
  onSuccess,
}: {
  open: boolean;
  intent?: AuthIntent;
  onClose: () => void;
  /** Called after a magic-link email is sent or Google redirect begins. */
  onSuccess?: () => void;
}) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocus(open, modalRef);
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setEmail("");
      setSent(false);
      setError(null);
      setBusy(false);
      emailRef.current?.focus();
    })();
    return () => {
      cancelled = true;
    };
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

  const copy = AUTH_COPY[intent] ?? AUTH_COPY.default;
  const googleHref = "/api/auth/google";

  const sendMagicLink = async () => {
    if (busy) return;
    const value = email.trim();
    if (!value) {
      setError("Enter your email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await requestMagicLink(value);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not send the sign-in email.");
      return;
    }
    setSent(true);
    onSuccess?.();
  };

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
            <h2 id={titleId}>{copy.title}</h2>
            <p>{copy.subtitle}</p>
          </div>
          <button
            type="button"
            className="tracker-icon-button"
            onClick={onClose}
            aria-label="Close sign in dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="tracker-modal-body auth-modal-body">
          {sent ? (
            <div className="auth-sent" role="status">
              <Mail size={22} aria-hidden="true" />
              <strong>Check your inbox</strong>
              <span>
                We sent a sign-in link to <b>{email.trim()}</b>. It expires in 15
                minutes. Click it to finish signing in.
              </span>
              <button type="button" className="tracker-button-secondary" onClick={onClose}>
                Done
              </button>
            </div>
          ) : (
            <>
              <a href={googleHref} className="auth-google-button">
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path
                    fill="#FFC107"
                    d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                  />
                  <path
                    fill="#4CAF50"
                    d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
                  />
                  <path
                    fill="#1976D2"
                    d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.3 5.3C41.4 35.4 44 30.1 44 24c0-1.3-.1-2.6-.4-3.9z"
                  />
                </svg>
                Continue with Google
              </a>

              <div className="auth-divider" role="separator" aria-label="or">
                <span>or</span>
              </div>

              <form
                className="auth-email-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMagicLink();
                }}
              >
                <label className="auth-email-field">
                  <span>Email</span>
                  <input
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    maxLength={254}
                    disabled={busy}
                  />
                </label>
                <button type="submit" className="tracker-button-primary" disabled={busy}>
                  {busy ? (
                    <Loader2 className="spin" size={15} aria-hidden="true" />
                  ) : (
                    <Mail size={15} aria-hidden="true" />
                  )}
                  {busy ? "Sending…" : "Email me a sign-in link"}
                </button>
              </form>

              {error && (
                <div className="keyword-error" role="alert">
                  {error}
                </div>
              )}

              <p className="auth-footnote">
                No password needed. Keyword Explorer works without an account.
                Tracking an app and the assistant need a free sign-in. We store
                only your email and subscription status.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
