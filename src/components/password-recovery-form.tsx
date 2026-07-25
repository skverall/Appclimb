"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, LoaderCircle, Mail } from "lucide-react";

export function PasswordRecoveryForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const submit = async (formData: FormData) => {
    setState("sending");
    setMessage("");
    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: String(formData.get("email") ?? "") }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Recovery request failed");
      }
      setState("sent");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Account recovery is temporarily unavailable",
      );
    }
  };

  if (state === "sent") {
    return (
      <div className="recovery-success" role="status">
        <CheckCircle2 size={24} />
        <div>
          <strong>If an account exists, we sent a secure reset link.</strong>
          <span>Check your email. The link expires in 30 minutes.</span>
        </div>
      </div>
    );
  }

  return (
    <form className="recovery-form" action={submit} aria-busy={state === "sending"}>
      <label htmlFor="recovery-email">
        Account email
        <span className="recovery-input">
          <Mail size={17} aria-hidden="true" />
          <input
            id="recovery-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
        </span>
      </label>
      {state === "error" && (
        <p className="auth-message error" role="alert">
          {message}
        </p>
      )}
      <button className="recovery-action" type="submit" disabled={state === "sending"}>
        {state === "sending" ? (
          <>
            <LoaderCircle className="spin" size={17} /> Sending…
          </>
        ) : (
          <>
            Send reset link <ArrowRight size={17} />
          </>
        )}
      </button>
    </form>
  );
}
