"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Lightbulb, X } from "lucide-react";

import type { KeywordSuggestion } from "@/lib/itunes";

type SuggestionRow = KeywordSuggestion & { alreadyTracked?: boolean };

export function SuggestionsModal({
  open,
  appName,
  suggestions,
  onClose,
  onConfirm,
}: {
  open: boolean;
  appName: string;
  suggestions: SuggestionRow[];
  onClose: () => void;
  onConfirm: (keywords: string[]) => void;
}) {
  const titleId = useId();
  const selectable = useMemo(
    () => suggestions.filter((item) => !item.alreadyTracked),
    [suggestions],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      // Pre-select relevant new suggestions (title, category, related phrases).
      const initial = new Set(
        selectable
          .filter((item) =>
            ["App title", "App Store category", "Related phrase"].includes(
              item.reason,
            ),
          )
          .map((item) => item.keyword)
          .slice(0, 12),
      );
      if (initial.size === 0) {
        for (const item of selectable.slice(0, 8)) initial.add(item.keyword);
      }
      setSelected(initial);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectable]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const toggle = (keyword: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  };

  return (
    <div className="tracker-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="tracker-modal tracker-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tracker-modal-header">
          <div>
            <h2 id={titleId}>
              <Lightbulb size={18} aria-hidden="true" /> Keyword suggestions
            </h2>
            <p>
              Derived from public metadata for <strong>{appName}</strong>. Select
              keywords to track — nothing is checked until you confirm.
            </p>
          </div>
          <button
            type="button"
            className="tracker-icon-button"
            onClick={onClose}
            aria-label="Close suggestions"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="tracker-modal-body">
          <div className="tracker-suggestion-toolbar">
            <button
              type="button"
              onClick={() =>
                setSelected(new Set(selectable.map((item) => item.keyword)))
              }
              disabled={selectable.length === 0}
            >
              Select all new
            </button>
            <button type="button" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <span>
              {selected.size} selected · {suggestions.length} suggested
            </span>
          </div>

          {suggestions.length === 0 ? (
            <div className="keyword-empty">
              <strong>No new suggestions</strong>
              <span>
                All derived phrases are already tracked, or metadata was too sparse.
                Try Add Keywords to enter terms manually.
              </span>
            </div>
          ) : (
            <ul className="tracker-suggestion-list">
              {suggestions.map((item) => {
                const tracked = Boolean(item.alreadyTracked);
                const checked = tracked || selected.has(item.keyword);
                return (
                  <li key={item.keyword}>
                    <label
                      className={
                        tracked
                          ? "tracker-suggestion-row is-tracked"
                          : "tracker-suggestion-row"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={tracked}
                        onChange={() => toggle(item.keyword)}
                      />
                      <span className="tracker-suggestion-text">
                        <strong>{item.keyword}</strong>
                        <small>{item.reason}</small>
                      </span>
                      {tracked && <span className="tracker-badge">Tracked</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="tracker-modal-footer">
          <button type="button" className="tracker-button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="tracker-button-primary"
            disabled={selected.size === 0}
            onClick={() => onConfirm([...selected])}
          >
            Add selected ({selected.size})
          </button>
        </footer>
      </div>
    </div>
  );
}
