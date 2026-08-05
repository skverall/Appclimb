// Browser file helpers shared by the keyword explorer and the My Apps tracker
// (CSV/JSON downloads and CSV escaping). Client-side only — nothing here ever
// leaves the browser.

/** Quote a CSV field when it contains a delimiter, quote, or newline. */
export function csvEscape(value: string): string {
  if (/[",\n\r]/u.test(value)) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}

/** Trigger a browser download of a text payload (Blob + anchor click). */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8",
): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
