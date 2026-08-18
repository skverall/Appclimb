"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal behavior shared by every dialog in the app:
 *
 * - traps keyboard focus inside the dialog while it is open (Tab / Shift+Tab
 *   cycle between the first and last focusable element),
 * - moves focus into the dialog on open when the dialog itself did not already
 *   focus something,
 * - restores focus to the previously focused element when the dialog closes.
 *
 * Pass the `ref` of the dialog element (the `role="dialog"` container).
 */
export function useModalFocus(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusables = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (el) =>
          el.offsetParent !== null || el === document.activeElement,
      );

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    // Give the dialog a chance to move focus itself (email fields, filters)
    // before we fall back to focusing the first focusable element.
    const frame = requestAnimationFrame(() => {
      if (
        document.activeElement &&
        container.contains(document.activeElement)
      ) {
        return;
      }
      const target = focusables()[0] ?? container;
      if (target === container) {
        container.tabIndex = -1;
      }
      target.focus();
    });

    container.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, containerRef]);
}