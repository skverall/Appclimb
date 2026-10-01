"use client";

import { useEffect, useRef, useState } from "react";
import { Columns3, Copy, Download, Ellipsis, Wand2 } from "lucide-react";

/** Secondary tracker actions, kept out of the main toolbar. */
export function TrackerMoreMenu({
  disabled,
  onBuilder,
  onCopy,
  onExport,
  onResetColumns,
}: {
  disabled?: boolean;
  onBuilder: () => void;
  onCopy: () => void;
  onExport: () => void;
  /** Shown only when the table's column widths were changed. */
  onResetColumns?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="tv-more" ref={rootRef}>
      <button
        type="button"
        className="tv-btn tv-btn--icon"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Ellipsis size={17} aria-hidden="true" />
      </button>
      {open && (
        <div className="tv-menu" role="menu">
          <button type="button" role="menuitem" onClick={run(onBuilder)} disabled={disabled}>
            <Wand2 size={15} aria-hidden="true" />
            <span>
              Keyword field builder
              <small>Fit your keywords into Apple&apos;s 100 characters</small>
            </span>
          </button>
          <button type="button" role="menuitem" onClick={run(onCopy)} disabled={disabled}>
            <Copy size={15} aria-hidden="true" />
            <span>
              Copy keyword field
              <small>Comma-separated, ready for App Store Connect</small>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={run(onExport)}
            disabled={disabled}
            aria-label="Export keywords as CSV"
          >
            <Download size={15} aria-hidden="true" />
            <span>
              Export CSV
              <small>Keywords, scores, positions</small>
            </span>
          </button>
          {onResetColumns && (
            <button type="button" role="menuitem" onClick={run(onResetColumns)}>
              <Columns3 size={15} aria-hidden="true" />
              <span>
                Reset column widths
                <small>Back to the default table layout</small>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
