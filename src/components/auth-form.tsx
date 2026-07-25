"use client";

import { useActionState, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";

import {
  login,
  signup,
  type AuthActionState,
} from "@/app/login/actions";

const INITIAL_STATE: AuthActionState = {};
type AuthMode = "login" | "signup";

export function AuthForm() {
  const [mode, setMode] = useState<AuthMode>("signup");

  return <AuthModeForm key={mode} mode={mode} onModeChange={setMode} />;
}

function AuthModeForm({
  mode,
  onModeChange,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
}) {
  const action = mode === "login" ? login : signup;
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const emailId = `${mode}-email`;
  const passwordId = `${mode}-password`;

  return (
    <form className="auth-form" action={formAction} aria-busy={pending}>
      <div className="auth-mode" role="group" aria-label="Account action">
        <button
          type="button"
          className={mode === "signup" ? "active" : ""}
          aria-pressed={mode === "signup"}
          disabled={pending}
          onClick={() => onModeChange("signup")}
        >
          Start trial
        </button>
        <button
          type="button"
          className={mode === "login" ? "active" : ""}
          aria-pressed={mode === "login"}
          disabled={pending}
          onClick={() => onModeChange("login")}
        >
          Sign in
        </button>
      </div>
      <label htmlFor={emailId}>
        Work email
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
        />
      </label>
      <label htmlFor={passwordId}>
        Password
        <input
          id={passwordId}
          name="password"
          type="password"
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder="At least 8 characters"
          required
        />
      </label>
      {state.error && (
        <p
          className="auth-message error"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          {state.error}
        </p>
      )}
      {state.message && (
        <p
          className="auth-message success"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {state.message}
        </p>
      )}
      <button className="auth-submit" type="submit" disabled={pending}>
        {pending ? (
          <>
            <LoaderCircle className="spin" size={17} aria-hidden="true" />{" "}
            Working…
          </>
        ) : (
          <>
            {mode === "signup" ? "Start 14-day trial" : "Sign in"}
            <ArrowRight size={17} aria-hidden="true" />
          </>
        )}
      </button>
      <p className="auth-terms">
        {mode === "signup" ? (
          <>
            No card required. Then $12.99/month or $129/year. By creating a
            workspace, you agree to the <Link href="/terms">Terms</Link> and
            acknowledge the <Link href="/privacy">Privacy Policy</Link>.
          </>
        ) : (
          <>
            Signing in does not start a new trial. Review our{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </>
        )}
      </p>
    </form>
  );
}
