/** Brand asset paths. Bump ICON_VERSION when regenerating icons to bust caches. */

export const ICON_VERSION = "20260802";

/** Versioned icon directory (preferred for HTML metadata / crawl). */
export const ICONS_V2 = "/icons/v2" as const;

export function iconUrl(
  name:
    | "favicon.ico"
    | "icon.svg"
    | "apple-touch-icon.png"
    | "icon-48.png"
    | "icon-192.png"
    | "icon-512.png",
): string {
  return `${ICONS_V2}/${name}?v=${ICON_VERSION}`;
}
