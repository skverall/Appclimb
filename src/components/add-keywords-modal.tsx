"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { X } from "lucide-react";

import { SUPPORTED_COUNTRIES } from "@/lib/aso";
import {
  MAX_KEYWORDS_PER_ADD,
  parseKeywordBatch,
  STARTER_KEYWORDS,
} from "@/lib/tracker";

export function AddKeywordsModal({
  open,
  defaultCountry,
  existingNormalized,
  onClose,
  onConfirm,
}: {
  open: boolean;
  defaultCountry: string;
  existingNormalized: ReadonlySet<string>;
  onClose: () => void;
  onConfirm: (keywords: string[], country: string) => void;
}) {
  const titleId = useId();
  const [country, setCountry] = useState(defaultCountry);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setCountry(defaultCountry);
      setText("");
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

  const parsed = useMemo(
    () => parseKeywordBatch(text, existingNormalized, { max: MAX_KEYWORDS_PER_ADD }),
    [text, existingNormalized],
  );

  if (!open) return null;

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
            <h2 id={titleId}>Add Keywords</h2>
            <p>
              Enter one keyword, or paste a list separated by commas or new lines
              (up to {MAX_KEYWORDS_PER_ADD}).
            </p>
          </div>
          <button
            type="button"
            className="tracker-icon-button"
            onClick={onClose}
            aria-label="Close add keywords"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="tracker-modal-body">
          <label className="country-select">
            <span>Storefront</span>
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              aria-label="Storefront for new keywords"
            >
              {SUPPORTED_COUNTRIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.flag} {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="tracker-textarea-label">
            <span>Keywords</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              placeholder={"meditation\nhabit tracker\nsleep sounds"}
              aria-label="Keywords to add"
              spellCheck={false}
            />
          </label>

          <div className="tracker-preset-row">
            <span>Need a ready-made list?</span>
            <button
              type="button"
              className="tracker-button-secondary"
              onClick={() => setText(STARTER_KEYWORDS.join("\n"))}
            >
              Use Fish Identifier starter set
            </button>
          </div>

          <div className="tracker-parse-summary" aria-live="polite">
            <span>
              <strong>{parsed.accepted.length}</strong> new
            </span>
            <span>
              <strong>{parsed.duplicates.length}</strong> duplicates in list
            </span>
            <span>
              <strong>{parsed.alreadyTracked.length}</strong> already tracked
            </span>
            <span>
              <strong>{parsed.invalid.length}</strong> invalid
            </span>
          </div>
        </div>

        <footer className="tracker-modal-footer">
          <button type="button" className="tracker-button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="tracker-button-primary"
            disabled={parsed.accepted.length === 0}
            onClick={() => onConfirm(parsed.accepted, country)}
          >
            Add {parsed.accepted.length || ""} keyword
            {parsed.accepted.length === 1 ? "" : "s"}
          </button>
        </footer>
      </div>
    </div>
  );
}
