/**
 * Favicon URL helpers for Web SaaS apps.
 * Multiple public resolvers are tried because any single host can 404 or
 * return an empty icon for a given domain.
 */

export function normalizeWebDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/^www\./u, "")
    .replace(/\/.*$/u, "")
    .replace(/:\d+$/u, "")
    .replace(/\.$/u, "");
}

/** Best default icon URL to persist for a web domain. */
export function preferredWebFaviconUrl(domain: string): string {
  const cleaned = normalizeWebDomain(domain);
  if (!cleaned) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleaned)}&sz=128`;
}

/**
 * Ordered favicon candidates for a domain. Prefer a stored URL first, then
 * public resolvers that tend to work from browsers without CORS issues.
 */
export function webFaviconCandidates(
  domain: string,
  preferred?: string | null,
): string[] {
  const cleaned = normalizeWebDomain(domain);
  const urls: string[] = [];
  if (preferred?.trim()) urls.push(preferred.trim());
  if (cleaned) {
    urls.push(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleaned)}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${encodeURIComponent(cleaned)}.ico`,
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleaned)}&sz=64`,
      `https://${cleaned}/favicon.ico`,
      `https://www.${cleaned}/favicon.ico`,
    );
  }
  return [...new Set(urls.filter(Boolean))];
}

/** True when a value looks like a hostname rather than a bundle id or store id. */
export function looksLikeWebDomain(value: string | null | undefined): boolean {
  if (!value) return false;
  const cleaned = normalizeWebDomain(value);
  return (
    cleaned.includes(".") &&
    !cleaned.startsWith("web:") &&
    !/^\d+$/u.test(cleaned) &&
    !cleaned.includes(" ")
  );
}
