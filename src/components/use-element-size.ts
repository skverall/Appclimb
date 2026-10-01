"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Content-box size of an element, kept current with ResizeObserver, so SVG
 * charts can draw at 1:1 pixels (crisp text, no stretched labels).
 */
export function useElementSize(
  ref: RefObject<HTMLElement | null>,
  initial: { width: number; height: number },
): { width: number; height: number } {
  const [size, setSize] = useState(initial);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width <= 0) return;
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
