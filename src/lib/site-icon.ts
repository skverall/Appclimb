/**
 * Server-side favicon resolution for Web SaaS apps.
 *
 * Icons are resolved on the server and served back from `/api/site-icon`
 * because the app CSP only allows same-origin images, so a browser can never
 * load a public favicon host directly. Resolving server-side also lets the
 * bytes be inspected: favicon endpoints answer `200` with an HTML error page
 * or a 1x1 placeholder often enough that a status code alone cannot be
 * trusted.
 */

import { normalizeWebDomain } from "@/lib/web-favicon";

/** Icons above this size are never a favicon and are not worth proxying. */
export const MAX_ICON_BYTES = 512 * 1024;

/** Below this, a response is an empty file or a tracking pixel, not an icon. */
export const MIN_ICON_BYTES = 48;

/** Suffixes that never carry a public favicon and may address internal hosts. */
const BLOCKED_DOMAIN_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".intranet",
  ".test",
  ".invalid",
  ".example",
  ".home.arpa",
  ".onion",
];

const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/u;

/**
 * Guards the proxy against being pointed at internal infrastructure. Only
 * public, DNS-resolvable hostnames are fetched.
 */
export function isProxyableIconDomain(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  const domain = normalizeWebDomain(value);
  if (!domain || !HOSTNAME_PATTERN.test(domain)) return false;
  if (BLOCKED_DOMAIN_SUFFIXES.some((suffix) => domain.endsWith(suffix))) {
    return false;
  }
  // Bare IP literals bypass DNS and can address private ranges.
  if (/^[\d.]+$/u.test(domain)) return false;
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  return /^[a-z]{2,}$/u.test(tld);
}

function matchesSignature(
  bytes: Uint8Array,
  offset: number,
  signature: number[],
): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Identifies image bytes by magic number rather than trusting the upstream
 * `content-type`. Single-page-app hosts commonly serve their HTML shell for
 * `/favicon.ico` with a `200`, and that has to be rejected.
 *
 * Raster formats only. An SVG served back from our own origin would render as
 * a scriptable document under the app CSP if the URL were opened directly, and
 * per-response CSP headers cannot override the global one in next.config.ts.
 */
export function sniffIconContentType(bytes: Uint8Array): string | null {
  if (bytes.length < MIN_ICON_BYTES || bytes.length > MAX_ICON_BYTES) {
    return null;
  }
  if (matchesSignature(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (matchesSignature(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (matchesSignature(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matchesSignature(bytes, 0, [0x42, 0x4d])) return "image/bmp";
  if (
    matchesSignature(bytes, 0, [0x00, 0x00, 0x01, 0x00]) ||
    matchesSignature(bytes, 0, [0x00, 0x00, 0x02, 0x00])
  ) {
    return "image/x-icon";
  }
  if (
    matchesSignature(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    matchesSignature(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }
  return null;
}

const LINK_TAG_PATTERN = /<link\b[^>]*>/giu;
const ICON_RELS = new Set([
  "icon",
  "shortcut",
  "apple-touch-icon",
  "apple-touch-icon-precomposed",
]);

function readAttribute(tag: string, name: string): string {
  const match = tag.match(
    new RegExp(
      `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
      "iu",
    ),
  );
  if (!match) return "";
  return (match[1] ?? match[2] ?? match[3] ?? "").trim();
}

/** Ranks declared icons so the sharpest one is tried first. */
function iconScore(rel: string, sizes: string): number {
  const declared = sizes.toLowerCase();
  // `sizes="any"` marks a scalable icon. Since SVG is not proxied, rank it
  // below a declared apple-touch-icon rather than at the top.
  if (declared.split(/\s+/u).includes("any")) return 96;
  const largest = declared
    .split(/\s+/u)
    .map((token) => Number.parseInt(token.split("x")[0] ?? "", 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (largest.length) return Math.max(...largest);
  // Undeclared sizes fall back to each rel's conventional dimensions.
  return rel.includes("apple-touch-icon") ? 180 : 64;
}

/**
 * Pulls `<link rel="icon">` and `<link rel="apple-touch-icon">` targets out of
 * a page, sharpest first. This is what produces a crisp mark for sites whose
 * icon lives on a CDN rather than at `/favicon.ico`.
 */
export function extractIconHrefs(
  html: string,
  baseUrl: string,
  limit = 3,
): string[] {
  const scored: Array<{ href: string; score: number }> = [];

  for (const [tag] of html.matchAll(LINK_TAG_PATTERN)) {
    const rel = readAttribute(tag, "rel").toLowerCase();
    const relTokens = rel.split(/\s+/u);
    if (!relTokens.some((token) => ICON_RELS.has(token))) continue;

    const href = readAttribute(tag, "href");
    if (!href || href.startsWith("data:")) continue;
    // SVG cannot be proxied safely, so it must not take a candidate slot.
    if (/\.svg(\?|#|$)/iu.test(href)) continue;

    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") {
      continue;
    }
    if (!isProxyableIconDomain(resolved.hostname)) continue;

    scored.push({
      href: resolved.toString(),
      score: iconScore(rel, readAttribute(tag, "sizes")),
    });
  }

  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score)
    .filter((entry) => {
      if (seen.has(entry.href)) return false;
      seen.add(entry.href);
      return true;
    })
    .slice(0, limit)
    .map((entry) => entry.href);
}

/**
 * Well-known icon locations tried when a page declares nothing usable.
 * DuckDuckGo is first because it answers from a CDN in a few hundred
 * milliseconds and returns an honest 404 for domains it has never seen.
 */
export function fallbackIconUrls(domain: string): string[] {
  const cleaned = normalizeWebDomain(domain);
  if (!cleaned) return [];
  return [
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(cleaned)}.ico`,
    `https://${cleaned}/apple-touch-icon.png`,
    `https://${cleaned}/favicon.ico`,
  ];
}
