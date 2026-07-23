"use client";

import { useActionState, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";

import {
  login,
  signup,
  type AuthActionState,
} from "@/app/login/actions";

const INITIAL_STATE: AuthActionState = {};

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const action = mode === "login" ? login : signup;
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form className="auth-form" action={formAction}>
      <div className="auth-mode">
        <button
          type="button"
          className={mode === "signup" ? "active" : ""}
          onClick={() => setMode("signup")}
        >
          Start trial
        </button>
        <button
          type="button"
          className={mode === "login" ? "active" : ""}
          onClick={() => setMode("login")}
        >
          Sign in
        </button>
      </div>
      <label>
        Work email
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder="At least 8 characters"
          required
        />
      </label>
      {state.error && <p className="auth-message error">{state.error}</p>}
      {state.message && <p className="auth-message success">{state.message}</p>}
      <button className="auth-submit" type="submit" disabled={pending}>
        {pending ? (
          <>
            <LoaderCircle className="spin" size={17} /> Working…
          </>
        ) : (
          <>
            {mode === "signup" ? "Start 14-day trial" : "Sign in"}
            <ArrowRight size={17} />
          </>
        )}
      </button>
      <p className="auth-terms">
        No card required. Then $12.99/month or $129/year.
      </p>
    </form>
  );
}
