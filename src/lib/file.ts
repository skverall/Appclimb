// Browser file helpers shared by the keyword explorer and the My Apps tracker
// (CSV/JSON downloads and CSV escaping). Client-side only — nothing here ever
// leaves the browser.

/**
 * Characters that make an otherwise-bare cell look like a spreadsheet formula
 * to Excel / Google Sheets / LibreOffice on open (CSV injection). Prefixing a
 * single apostrophe neutralizes them; spreadsheet apps strip the prefix and
 * show the literal text.
 */
const CSV_FORMULA_PREFIX = /^[=+\-@\t]/u;

/** Quote a CSV field when it contains a delimiter, quote, or newline, and
 * neutralize any leading spreadsheet-formula character. */
export function csvEscape(value: string): string {
  const field = CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value;
  if (/[",\n\r]/u.test(field)) {
    return `"${field.replace(/"/gu, '""')}"`;
  }
  return field;
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
