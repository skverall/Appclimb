"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { useModalFocus } from "@/components/use-modal-focus";
import { MAX_BATCH_KEYWORDS, parseKeywordBatch } from "@/lib/aso";

export function BulkKeywordsModal({
  open,
  countryLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  countryLabel: string;
  onClose: () => void;
  onConfirm: (keywords: string[]) => void;
}) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocus(open, modalRef);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setText("");
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const parsed = useMemo(
    () => parseKeywordBatch(text, { max: MAX_BATCH_KEYWORDS }),
    [text],
  );

  if (!open) return null;

  return (
    <div className="tracker-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="tracker-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tracker-modal-header">
          <div>
            <h2 id={titleId}>Analyze a list</h2>
            <p>
              Paste one keyword per line, or a comma-separated list — all of
              them are analyzed in the {countryLabel} store (up to{" "}
              {MAX_BATCH_KEYWORDS}).
            </p>
          </div>
          <button
            type="button"
            className="tracker-icon-button"
            onClick={onClose}
            aria-label="Close analyze list"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="tracker-modal-body">
          <label className="tracker-textarea-label">
            <span>Keywords</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              placeholder={"meditation\nhabit tracker\nsleep sounds"}
              aria-label="Keywords to analyze"
              spellCheck={false}
            />
          </label>

          <div className="tracker-parse-summary" aria-live="polite">
            <span>
              <strong>{parsed.accepted.length}</strong> ready
            </span>
            <span>
              <strong>{parsed.duplicates.length}</strong> duplicates in list
            </span>
            <span>
              <strong>{parsed.invalid.length}</strong> skipped
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
            onClick={() => onConfirm(parsed.accepted)}
          >
            Analyze {parsed.accepted.length || ""} keyword
            {parsed.accepted.length === 1 ? "" : "s"}
          </button>
        </footer>
      </div>
    </div>
  );
}
