"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export interface ColumnSpec {
  id: string;
  /** Default width in px. */
  width: number;
  /** Narrowest the user may drag it. */
  min: number;
  label: string;
}

const MAX_WIDTH = 900;
const KEY_STEP = 16;

function clamp(spec: ColumnSpec, width: number): number {
  return Math.round(Math.min(MAX_WIDTH, Math.max(spec.min, width)));
}

function defaultsOf(columns: readonly ColumnSpec[]): Record<string, number> {
  return Object.fromEntries(columns.map((column) => [column.id, column.width]));
}

/**
 * Spreadsheet-style column widths: drag a header edge to resize, double-click
 * it to restore the default. Widths are a per-browser preference kept in
 * localStorage, so a reload keeps the layout. Pass a stable (module-level)
 * `columns` array.
 */
export function useColumnWidths(storageKey: string, columns: readonly ColumnSpec[]) {
  const [widths, setWidths] = useState<Record<string, number>>(() => defaultsOf(columns));
  const [resizing, setResizing] = useState<string | null>(null);
  const drag = useRef<{ id: string; startX: number; startWidth: number } | null>(null);
  const loaded = useRef(false);

  // Read saved widths after mount so server and client render the same HTML.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem(storageKey);
        const saved = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const next = defaultsOf(columns);
        for (const spec of columns) {
          const value = Number(saved[spec.id]);
          if (Number.isFinite(value) && value > 0) next[spec.id] = clamp(spec, value);
        }
        setWidths(next);
      } catch {
        // Unreadable preference: keep the defaults.
      }
      loaded.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey, columns]);

  // Persist once a drag ends (not on every pointer move).
  useEffect(() => {
    if (!loaded.current || resizing) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {
      // Private mode: the layout just isn't remembered.
    }
  }, [storageKey, widths, resizing]);

  const setWidth = useCallback(
    (id: string, width: number) => {
      const spec = columns.find((column) => column.id === id);
      if (!spec) return;
      setWidths((current) => ({ ...current, [id]: clamp(spec, width) }));
    },
    [columns],
  );

  const reset = useCallback(() => {
    setWidths(defaultsOf(columns));
  }, [columns]);

  const handleProps = (id: string) => {
    const spec = columns.find((column) => column.id === id)!;
    return {
      role: "separator" as const,
      "aria-orientation": "vertical" as const,
      "aria-label": `Resize ${spec.label} column`,
      "aria-valuenow": widths[id],
      "aria-valuemin": spec.min,
      "aria-valuemax": MAX_WIDTH,
      tabIndex: 0,
      title: "Drag to resize · double-click to reset",
      className: `col-resizer${resizing === id ? " is-active" : ""}`,
      onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id, startX: event.clientX, startWidth: widths[id] ?? spec.width };
        setResizing(id);
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const active = drag.current;
        if (!active || active.id !== id) return;
        setWidth(id, active.startWidth + event.clientX - active.startX);
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        if (!drag.current) return;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setResizing(null);
      },
      onPointerCancel: () => {
        drag.current = null;
        setResizing(null);
      },
      onDoubleClick: (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
        setWidth(id, spec.width);
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setWidth(id, (widths[id] ?? spec.width) + (event.key === "ArrowRight" ? KEY_STEP : -KEY_STEP));
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setWidth(id, spec.width);
        }
      },
    };
  };

  const total = columns.reduce((sum, column) => sum + (widths[column.id] ?? column.width), 0);
  const customized = columns.some((column) => (widths[column.id] ?? column.width) !== column.width);

  return { widths, total, resizing, customized, handleProps, reset };
}
