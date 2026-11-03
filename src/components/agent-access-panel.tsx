"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plug, Trash2 } from "lucide-react";

import { useAccount } from "@/components/account-provider";

interface Grant {
  id: string;
  kind: "oauth" | "api_key";
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface AccessState {
  grants: Grant[];
  usage: { used: number; limit: number };
  plan: "free" | "pro";
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="connect-copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
      aria-label={copied ? "Copied" : `${label}: ${text}`}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Connected AI apps, personal API keys and today's agent checks, for signed-in users. */
export function AgentAccessPanel() {
  const { signedIn, loading, openAuth } = useAccount();
  const [state, setState] = useState<AccessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/agent-keys", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setState((await response.json()) as AccessState);
      setError(null);
    } catch {
      setError("Could not load your connections. Reload the page to try again.");
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, load]);

  if (loading) return null;
  if (!signedIn) {
    return (
      <div className="connect-panel connect-panel-guest">
        <p>
          Sign in to see the AI apps you’ve connected, disconnect them, or create an API key for a headless agent.
        </p>
        <button type="button" className="tracker-button-primary" onClick={() => openAuth("default")}>
          Sign in free
        </button>
      </div>
    );
  }

  const createKey = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/agent-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || "API key" }),
      });
      const data = (await response.json()) as { key?: string; error?: string };
      if (!response.ok || !data.key) throw new Error(data.error ?? "Could not create the key.");
      setNewKey(data.key);
      setLabel("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the key.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grant: Grant) => {
    const what = grant.kind === "api_key" ? `the API key “${grant.name}”` : grant.name;
    if (!window.confirm(`Disconnect ${what}? It will stop working right away.`)) return;
    await fetch(`/api/agent-keys?id=${encodeURIComponent(grant.id)}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="connect-panel">
      {state && (
        <p className="connect-usage">
          App Store checks used by agents today: <b>{state.usage.used}</b> of {state.usage.limit}
          {state.plan === "free" ? (
            <>
              {" "}
              · <a href="/pricing">Pro allows 1,000 a day</a>
            </>
          ) : null}
        </p>
      )}

      <h3>Connected</h3>
      {state && state.grants.length === 0 && <p className="connect-muted">Nothing connected yet.</p>}
      {state && state.grants.length > 0 && (
        <ul className="connect-grants">
          {state.grants.map((grant) => (
            <li key={grant.id}>
              {grant.kind === "api_key" ? (
                <KeyRound size={16} aria-hidden="true" />
              ) : (
                <Plug size={16} aria-hidden="true" />
              )}
              <div>
                <strong>{grant.name}</strong>
                <span>
                  {grant.kind === "api_key" ? "API key" : "Connected app"} · added {formatDate(grant.createdAt)} · last
                  used {formatDate(grant.lastUsedAt)}
                </span>
              </div>
              <button
                type="button"
                className="tracker-icon-button"
                onClick={() => void revoke(grant)}
                aria-label={`Disconnect ${grant.name}`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>API key for headless agents</h3>
      <p className="connect-muted">
        For agents that can’t open a browser to sign in (CI jobs, cloud agents, scripts). Send it as{" "}
        <code>Authorization: Bearer &lt;key&gt;</code>. Treat it like a password.
      </p>
      {newKey && (
        <div className="connect-new-key" role="status">
          <span>Copy your key now — it won’t be shown again.</span>
          <code>{newKey}</code>
          <CopyButton text={newKey} label="Copy key" />
        </div>
      )}
      <form
        className="connect-key-form"
        onSubmit={(event) => {
          event.preventDefault();
          void createKey();
        }}
      >
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Name, e.g. GitHub Actions"
          maxLength={80}
          aria-label="API key name"
          disabled={busy}
        />
        <button type="submit" className="tracker-button-secondary" disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <KeyRound size={15} aria-hidden="true" />}
          Create API key
        </button>
      </form>
      {error && (
        <p className="agent-consent-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
