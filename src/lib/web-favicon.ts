/**
 * Favicon URL helpers for Web SaaS apps.
 * Multiple public resolvers are tried because any single host can 404 or
 * return an empty icon for a given domain.
 */

export function normalizeWebDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^web:/u, "")
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
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(cleaned)}.ico`;
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
  const pref = preferred?.trim();
  const isGoogleFavicon = pref?.includes("google.com/s2/favicons");

  if (pref && !isGoogleFavicon) {
    urls.push(pref);
  }
  if (cleaned) {
    urls.push(
      `https://icons.duckduckgo.com/ip3/${encodeURIComponent(cleaned)}.ico`,
      `https://icon.horse/icon/${encodeURIComponent(cleaned)}`,
      `https://unavatar.io/${encodeURIComponent(cleaned)}`,
      `https://${cleaned}/favicon.ico`,
      `https://www.${cleaned}/favicon.ico`,
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleaned)}&sz=128`,
    );
  }
  if (pref && isGoogleFavicon) {
    urls.push(pref);
  }
  return [...new Set(urls.filter(Boolean))];
}

/** True when a value looks like a hostname rather than a bundle id or store id. */
export function looksLikeWebDomain(value: string | null | undefined): boolean {
  if (!value) return false;
  const cleaned = normalizeWebDomain(value);
  return (
    cleaned.includes(".") &&
    !/^\d+$/u.test(cleaned) &&
    !cleaned.includes(" ")
  );
}
