/**
 * Same-origin redirect targets for sign-in (`next=`).
 *
 * Only a plain absolute path is accepted. `//host` and `/\host` are rejected:
 * URL parsers treat a backslash like a slash, so `/\evil.com` resolves to
 * another origin and would turn sign-in into an open redirect.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.includes("\\")) return fallback;
  // Control characters (tabs and newlines are stripped by URL parsers).
  if (/[\u0000-\u001f\u007f]/u.test(value)) return fallback;
  try {
    const base = "https://appclimb.invalid";
    const resolved = new URL(value, base);
    if (resolved.origin !== base) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
