"use client";

import { useEffect, useMemo, useState } from "react";
import { AppWindow, LoaderCircle, Search, Store } from "lucide-react";

import { ModalDialog } from "@/components/modal-dialog";
import {
  cleanSearchResult,
  searchAppStoreCatalog,
  type CatalogApp,
} from "@/lib/itunes";

/**
 * Growth CI onboarding: iOS App Store apps only.
 * Web SaaS and Google Play are intentionally not offered.
 */
export function AddIosAppDialog({
  onClose,
  onAdded,
  storefront = "US",
}: {
  onClose: () => void;
  onAdded: (appId: string) => void;
  storefront?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogApp[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [addingId, setAddingId] = useState("");
  const [error, setError] = useState("");

  const parsedId = useMemo(() => {
    const match =
      query.match(/id(\d{5,15})/iu) || query.trim().match(/^(\d{5,15})$/u);
    return match ? match[1] : null;
  }, [query]);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setState("idle");
      return;
    }
    if (parsedId) {
      // Direct App Store URL / numeric ID — lookup is enough when user adds.
      setResults([]);
      setState("ready");
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      setState("loading");
      void searchAppStoreCatalog(query, storefront)
        .then((apps) => {
          if (cancelled) return;
          setResults(apps.slice(0, 8));
          setState("ready");
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setState("error");
        });
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, parsedId, storefront]);

  async function addApp(app: CatalogApp) {
    setAddingId(app.appStoreId);
    setError("");
    try {
      const response = await fetch("/api/apps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform: "app-store",
          storefront: storefront.toUpperCase().slice(0, 2) || "US",
          metadata: {
            appStoreId: app.appStoreId,
            name: app.name,
            bundleId: app.bundleId || undefined,
            developer: app.developer || undefined,
            genre: app.genre || undefined,
            iconUrl: app.iconUrl || undefined,
            storeUrl: app.storeUrl || undefined,
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { id?: string };
        error?: string;
      };
      if (!response.ok || !payload.data?.id) {
        setError(payload.error ?? "Could not add this app. Try again.");
        return;
      }
      onAdded(payload.data.id);
    } catch {
      setError("Could not add this app. Try again.");
    } finally {
      setAddingId("");
    }
  }

  async function addById() {
    if (!parsedId) return;
    setAddingId(parsedId);
    setError("");
    try {
      // Browser-side iTunes lookup (Workers IPs are blocked by Apple).
      const response = await fetch(
        `https://itunes.apple.com/lookup?id=${encodeURIComponent(parsedId)}&country=${encodeURIComponent(storefront)}`,
      );
      const payload = (await response.json()) as {
        results?: Array<Record<string, unknown>>;
      };
      const raw = payload.results?.[0];
      const cleaned = raw
        ? cleanSearchResult({
            trackId: Number(raw.trackId),
            trackName: typeof raw.trackName === "string" ? raw.trackName : "",
            bundleId: typeof raw.bundleId === "string" ? raw.bundleId : "",
            sellerName: typeof raw.sellerName === "string" ? raw.sellerName : "",
            primaryGenreName:
              typeof raw.primaryGenreName === "string"
                ? raw.primaryGenreName
                : "",
            artworkUrl100:
              typeof raw.artworkUrl100 === "string" ? raw.artworkUrl100 : "",
            trackViewUrl:
              typeof raw.trackViewUrl === "string" ? raw.trackViewUrl : "",
          })
        : null;
      if (!cleaned) {
        setError("App Store listing not found for that ID.");
        return;
      }
      await addApp(cleaned);
    } catch {
      setError("Could not look up that App Store ID.");
    } finally {
      setAddingId("");
    }
  }

  return (
    <ModalDialog
      labelledBy="add-ios-app-title"
      onClose={onClose}
      dialogClassName="settings-dialog add-app-dialog"
      closeLabel="Close add app"
    >
      <div className="add-app-heading">
        <span className="setup-provider-mark">
          <AppWindow size={20} />
        </span>
        <div>
          <span className="eyebrow">Growth CI setup</span>
          <h2 id="add-ios-app-title">Add your iOS app</h2>
          <p>
            Paste an App Store URL or numeric ID, or search by name. Only iOS is
            supported.
          </p>
        </div>
      </div>

      <label className="growth-ci-add-label">
        App Store URL, ID, or name
        <div className="growth-ci-add-search">
          <Search size={16} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="https://apps.apple.com/app/id… or Car Dealer Tracker"
            autoFocus
          />
        </div>
      </label>

      {parsedId ? (
        <button
          type="button"
          className="growth-ci-btn"
          disabled={Boolean(addingId)}
          onClick={() => void addById()}
        >
          {addingId ? (
            <>
              <LoaderCircle size={16} className="spin" /> Adding…
            </>
          ) : (
            <>
              <Store size={16} /> Add App Store ID {parsedId}
            </>
          )}
        </button>
      ) : null}

      {state === "loading" ? (
        <p className="growth-ci-subtle">Searching App Store…</p>
      ) : null}
      {state === "error" ? (
        <p className="growth-ci-subtle">Search failed. Try an App Store URL.</p>
      ) : null}

      {results.length > 0 ? (
        <ul className="growth-ci-add-results">
          {results.map((app) => (
            <li key={app.appStoreId}>
              <button
                type="button"
                disabled={Boolean(addingId)}
                onClick={() => void addApp(app)}
              >
                {app.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={app.iconUrl} alt="" width={40} height={40} />
                ) : (
                  <span className="growth-ci-app-icon growth-ci-app-icon--empty" />
                )}
                <span>
                  <strong>{app.name}</strong>
                  <small>
                    {app.developer}
                    {app.genre ? ` · ${app.genre}` : ""}
                  </small>
                </span>
                <span className="growth-ci-add-action">
                  {addingId === app.appStoreId ? "Adding…" : "Add"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="growth-ci-banner growth-ci-banner--error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="growth-ci-subtle">
        Next: connect RevenueCat and PostHog in Settings, then confirm session,
        activation, and version mapping.
      </p>
    </ModalDialog>
  );
}
