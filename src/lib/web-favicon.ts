/**
 * Favicon URL helpers for Web SaaS apps.
 *
 * The browser never loads a public favicon host directly: the app CSP allows
 * `img-src 'self'` only, so every third-party icon URL is blocked before the
 * request leaves the page. Icons are resolved by `/api/site-icon` instead,
 * which fetches and verifies them server-side.
 */

export function normalizeWebDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^web:/u, "")
    .replace(/^https?:\/\//u, "")
    .replace(/^www\./u, "")
    .replace(/\/.*$/u, "")
    // Trailing root dot first, so a fully qualified `example.com.:8443` still
    // has its port stripped.
    .replace(/\.$/u, "")
    .replace(/:\d+$/u, "")
    .replace(/\.$/u, "");
}

/** Same-origin icon URL for a web domain; resolved server-side on request. */
export function preferredWebFaviconUrl(domain: string): string {
  const cleaned = normalizeWebDomain(domain);
  if (!cleaned) return "";
  return `/api/site-icon?domain=${encodeURIComponent(cleaned)}`;
}

/**
 * True when the app CSP can actually render an icon URL. Anything else has to
 * go through the proxy, however good the stored value looks.
 */
function isRenderableIconUrl(url: string): boolean {
  if (url.startsWith("/")) return true;
  if (url.startsWith("data:image/")) return true;
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") return false;
    // Mirrors the `img-src` allowlist in next.config.ts.
    return hostname === "appclimb.app" || hostname.endsWith(".mzstatic.com");
  } catch {
    return false;
  }
}

/**
 * Ordered favicon candidates for a domain: a stored URL first when the CSP
 * permits it, then the proxy, which runs its own multi-source resolution.
 */
export function webFaviconCandidates(
  domain: string,
  preferred?: string | null,
): string[] {
  const urls: string[] = [];
  const pref = preferred?.trim();

  if (pref && isRenderableIconUrl(pref)) {
    urls.push(pref);
  }
  urls.push(preferredWebFaviconUrl(domain));

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
