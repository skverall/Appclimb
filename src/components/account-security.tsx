"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";

export function AccountSecurity() {
  const [open, setOpen] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const submit = async (formData: FormData) => {
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    if (newPassword !== confirmation) {
      setState("error");
      setMessage("New passwords do not match.");
      return;
    }
    setState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        if (response.status === 401) {
          throw new Error("Current password is incorrect.");
        }
        throw new Error(payload?.error || "Password could not be changed.");
      }
      setState("saved");
      setMessage("Password changed. All sessions were signed out.");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Password could not be changed.",
      );
    }
  };

  return (
    <section className="account-section account-security" aria-labelledby="security-title">
      <div className="account-section-heading">
        <div>
          <strong id="security-title">Security</strong>
          <p>Keep access to your workspace and connected credentials safe.</p>
        </div>
        <ShieldCheck size={19} />
      </div>

      {state === "saved" ? (
        <div className="security-success" role="status">
          <CheckCircle2 size={20} />
          <div>
            <strong>Password updated</strong>
            <span>{message}</span>
          </div>
          <button type="button" onClick={() => window.location.assign("/login")}>
            Sign in again
          </button>
        </div>
      ) : !open ? (
        <button
          className="security-action-row"
          type="button"
          onClick={() => setOpen(true)}
        >
          <span>
            <KeyRound size={18} />
            <span>
              <strong>Change password</strong>
              <small>Verify your current password first</small>
            </span>
          </span>
          <ChevronRight size={17} />
        </button>
      ) : (
        <form className="security-form" action={submit} aria-busy={state === "saving"}>
          <label>
            Current password
            <span className="password-input">
              <input
                name="currentPassword"
                type={showPasswords ? "text" : "password"}
                minLength={8}
                maxLength={128}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                onClick={() => setShowPasswords((visible) => !visible)}
              >
                {showPasswords ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
          <div className="security-new-passwords">
            <label>
              New password
              <input
                name="newPassword"
                type={showPasswords ? "text" : "password"}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                name="confirmation"
                type={showPasswords ? "text" : "password"}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
          </div>
          <span className="password-guidance">
            At least 8 characters; use a unique phrase you do not reuse.
          </span>
          {state === "error" && (
            <p className="settings-error" role="alert">
              {message}
            </p>
          )}
          <div className="security-form-actions">
            <button
              className="secondary-action"
              type="button"
              onClick={() => {
                setOpen(false);
                setState("idle");
                setMessage("");
              }}
            >
              Cancel
            </button>
            <button
              className="primary-action"
              type="submit"
              disabled={state === "saving"}
            >
              {state === "saving" ? (
                <>
                  <LoaderCircle className="spin" size={17} /> Saving…
                </>
              ) : (
                "Save password"
              )}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
