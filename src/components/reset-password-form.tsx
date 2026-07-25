"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";

export function ResetPasswordForm({ token }: { token: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    token ? "idle" : "error",
  );
  const [message, setMessage] = useState(
    token ? "" : "This reset link is incomplete.",
  );

  const submit = async (formData: FormData) => {
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    if (newPassword !== confirmation) {
      setState("error");
      setMessage("Passwords do not match.");
      return;
    }
    setState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Password reset failed");
      }
      setState("saved");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Password reset is temporarily unavailable",
      );
    }
  };

  if (state === "saved") {
    return (
      <div className="recovery-success recovery-reset-success" role="status">
        <CheckCircle2 size={25} />
        <div>
          <strong>Password updated</strong>
          <span>All existing sessions were signed out for security.</span>
        </div>
        <Link className="recovery-action" href="/login">
          Sign in with new password
        </Link>
      </div>
    );
  }

  return (
    <form className="recovery-form reset-password-form" action={submit}>
      <label htmlFor="reset-password">
        New password
        <span className="password-input">
          <input
            id="reset-password"
            name="newPassword"
            type={showPassword ? "text" : "password"}
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            required
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
      <label htmlFor="reset-confirmation">
        Confirm new password
        <input
          id="reset-confirmation"
          name="confirmation"
          type={showPassword ? "text" : "password"}
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <span className="password-guidance">
        Use at least 8 characters. A longer unique phrase is strongest.
      </span>
      {state === "error" && (
        <p className="auth-message error" role="alert">
          {message}
        </p>
      )}
      <button
        className="recovery-action"
        type="submit"
        disabled={state === "saving" || !token}
      >
        {state === "saving" ? (
          <>
            <LoaderCircle className="spin" size={17} /> Updating…
          </>
        ) : (
          "Save new password"
        )}
      </button>
    </form>
  );
}
