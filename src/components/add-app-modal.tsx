"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import { SUPPORTED_COUNTRIES } from "@/lib/aso";
import {
  humanizeItunesError,
  resolveAppCandidates,
} from "@/lib/tracker";
import type { CatalogApp } from "@/lib/itunes";

export function AddAppModal({
  open,
  defaultCountry = "US",
  existingKeys,
  onClose,
  onSelect,
}: {
  open: boolean;
  defaultCountry?: string;
  /** Composite keys `appStoreId:COUNTRY` already tracked. */
  existingKeys: ReadonlySet<string>;
  onClose: () => void;
  onSelect: (app: CatalogApp, country: string) => void;
}) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [country, setCountry] = useState(defaultCountry);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogApp[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setCountry(defaultCountry);
      setQuery("");
      setResults([]);
      setError(null);
      inputRef.current?.focus();
    })();
    return () => {
      cancelled = true;
    };
  }, [open, defaultCountry]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (!open) return null;

  const search = async () => {
    const term = query.trim();
    if (term.length < 2) {
      setError("Enter an app name, App Store URL, or numeric App Store ID.");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const apps = await resolveAppCandidates(term, country, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setResults(apps);
      if (apps.length === 0) {
        setError("No apps found for that query in the selected storefront.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setResults([]);
      setError(humanizeItunesError(err));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <div className="tracker-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="tracker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tracker-modal-header">
          <div>
            <h2 id={titleId}>Add App</h2>
            <p>Search by name, paste an App Store URL, or enter an App Store ID.</p>
          </div>
          <button
            type="button"
            className="tracker-icon-button"
            onClick={onClose}
            aria-label="Close add app dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="tracker-modal-body">
          <div className="tracker-form-row">
            <label className="country-select">
              <span>Store country</span>
              <select
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                aria-label="Store country for app lookup"
              >
                {SUPPORTED_COUNTRIES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.flag} {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <form
            className="tracker-search-form"
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <Search size={16} aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="App name, URL, or ID…"
              aria-label="Search for an app"
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={busy || query.trim().length < 2}>
              {busy ? (
                <Loader2 className="spin" size={15} aria-hidden="true" />
              ) : (
                "Search"
              )}
            </button>
          </form>

          {error && (
            <div className="keyword-error" role="alert">
              {error}
            </div>
          )}

          {busy && results.length === 0 && (
            <div className="tracker-skeleton-list" aria-busy="true" aria-label="Searching">
              <div className="tracker-skeleton-row" />
              <div className="tracker-skeleton-row" />
              <div className="tracker-skeleton-row" />
            </div>
          )}

          {results.length > 0 && (
            <ul className="tracker-app-results">
              {results.map((app) => {
                const key = `${app.appStoreId}:${country}`;
                const already = existingKeys.has(key);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => onSelect(app, country)}
                      aria-label={
                        already
                          ? `${app.name} already tracked in ${country}`
                          : `Add ${app.name}`
                      }
                    >
                      {app.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={app.iconUrl}
                          alt=""
                          width={44}
                          height={44}
                          loading="lazy"
                        />
                      ) : (
                        <span className="tracker-app-icon-fallback" aria-hidden="true">
                          {app.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="tracker-app-result-meta">
                        <strong>{app.name}</strong>
                        <small>
                          {app.developer || "Unknown developer"}
                          {app.genre ? ` · ${app.genre}` : ""}
                        </small>
                        <small className="tracker-app-id">ID {app.appStoreId}</small>
                      </span>
                      <span className="tracker-app-result-action">
                        {already ? "Added" : "Select"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
