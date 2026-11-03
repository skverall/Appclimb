"use client";

import { useState } from "react";
import { Check, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";

import { requestMagicLink } from "@/lib/account";

const CAN_DO = [
  "Check Apple's popularity, difficulty and a verdict for App Store keywords",
  "Find related, autocomplete and trending App Store searches",
  "Look up apps and check where they rank",
  "Use your plan's daily App Store checks",
];

const CANNOT_DO = ["See or change billing", "Change your account or email", "Read your tracked apps"];

/**
 * Email + password sign-in for the one app-directory reviewer account
 * (src/lib/review-login.ts). Rendered only when that account is configured.
 */
function ReviewerSignIn({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/review-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, next: nextPath }),
      });
      const data = (await response.json().catch(() => ({}))) as { next?: string; error?: string };
      if (!response.ok || !data.next) {
        setBusy(false);
        setError(data.error ?? "Could not sign in.");
        return;
      }
      window.location.assign(data.next);
    } catch {
      setBusy(false);
      setError("Network error. Try again.");
    }
  };

  return (
    <details className="agent-consent-reviewer">
      <summary>App directory reviewer? Sign in with a password</summary>
      <form
        className="auth-email-form"
        onSubmit={(event) => {
          event.preventDefault();
          void signIn();
        }}
      >
        <label className="auth-email-field">
          <span>Reviewer email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            maxLength={254}
            required
            disabled={busy}
          />
        </label>
        <label className="auth-email-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            maxLength={256}
            required
            disabled={busy}
          />
        </label>
        <button type="submit" className="tracker-button-secondary" disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <KeyRound size={15} aria-hidden="true" />}
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && (
          <p className="agent-consent-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}

export function AgentSignIn({
  nextPath,
  clientName,
  reviewLogin = false,
}: {
  nextPath: string;
  clientName: string;
  reviewLogin?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleHref = `/api/auth/google?next=${encodeURIComponent(nextPath)}`;

  const send = async () => {
    const value = email.trim();
    if (!value) {
      setError("Enter your email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await requestMagicLink(value, nextPath);
    setBusy(false);
    if (result.ok) setSent(true);
    else setError(result.error ?? "Could not send the sign-in email.");
  };

  if (sent) {
    return (
      <div className="agent-consent-card" role="status">
        <Mail size={22} aria-hidden="true" />
        <h1>Check your inbox</h1>
        <p>
          We sent a sign-in link to <b>{email.trim()}</b>. Open it in this browser to finish connecting{" "}
          {clientName}. It expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="agent-consent-card">
      <ShieldCheck size={24} aria-hidden="true" className="agent-consent-icon" />
      <h1>Sign in to connect {clientName}</h1>
      <p>
        {clientName} wants to use AppClimb on your behalf. Sign in or create a free account — it takes a few
        seconds and needs no card.
      </p>
      <a href={googleHref} className="auth-google-button">
        Continue with Google
      </a>
      <div className="auth-divider" role="separator" aria-label="or">
        <span>or</span>
      </div>
      <form
        className="auth-email-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="auth-email-field">
          <span>Email</span>
          <input
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
          {busy ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <Mail size={15} aria-hidden="true" />}
          {busy ? "Sending…" : "Email me a sign-in link"}
        </button>
        {error && (
          <p className="agent-consent-error" role="alert">
            {error}
          </p>
        )}
      </form>
      {reviewLogin && <ReviewerSignIn nextPath={nextPath} />}
    </div>
  );
}

export function AgentConsent({
  requestId,
  clientName,
  returnTo,
  email,
}: {
  requestId: string;
  clientName: string;
  returnTo: string;
  email: string;
}) {
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (approve: boolean) => {
    setBusy(approve ? "allow" : "deny");
    setError(null);
    try {
      const response = await fetch("/api/oauth/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: requestId, approve }),
      });
      const data = (await response.json().catch(() => ({}))) as { redirect?: string; error?: string };
      if (!response.ok || !data.redirect) {
        setBusy(null);
        setError(data.error ?? "Something went wrong. Try connecting again.");
        return;
      }
      if (approve) setDone(true);
      window.location.assign(data.redirect);
    } catch {
      setBusy(null);
      setError("Network error. Try again.");
    }
  };

  if (done) {
    return (
      <div className="agent-consent-card" role="status">
        <Check size={24} aria-hidden="true" className="agent-consent-icon" />
        <h1>{clientName} is connected</h1>
        <p>Go back to {clientName} and ask it to research keywords for your app. You can close this tab.</p>
      </div>
    );
  }

  return (
    <div className="agent-consent-card">
      <ShieldCheck size={24} aria-hidden="true" className="agent-consent-icon" />
      <h1>Allow {clientName} to use AppClimb?</h1>
      <p>
        Signed in as <b>{email}</b>. After you allow it, you’ll go back to <b>{returnTo}</b>.
      </p>
      <div className="agent-consent-lists">
        <div>
          <h2>It will be able to</h2>
          <ul>
            {CAN_DO.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2>It won’t be able to</h2>
          <ul className="is-negative">
            {CANNOT_DO.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="agent-consent-actions">
        <button
          type="button"
          className="tracker-button-primary"
          disabled={busy !== null}
          onClick={() => void decide(true)}
        >
          {busy === "allow" ? <Loader2 className="spin" size={15} aria-hidden="true" /> : null}
          Allow
        </button>
        <button
          type="button"
          className="tracker-button-secondary"
          disabled={busy !== null}
          onClick={() => void decide(false)}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="agent-consent-error" role="alert">
          {error}
        </p>
      )}
      <p className="agent-consent-footnote">
        You can disconnect it any time on <a href="/connect">appclimb.app/connect</a>.
      </p>
    </div>
  );
}
