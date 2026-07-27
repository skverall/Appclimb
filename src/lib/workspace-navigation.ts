/**
 * Growth CI primary navigation.
 *
 * Legacy section ids remain accepted in URLs so old bookmarks do not 404;
 * they resolve to the Growth CI home or Settings (sources).
 */

export const WORKSPACE_SECTIONS = [
  "growth",
  "sources",
  // Legacy aliases (resolved in workspaceSectionFromValue)
  "pulse",
  "diagnose",
  "ai-visibility",
  "lab",
] as const;

export type WorkspaceSection = (typeof WORKSPACE_SECTIONS)[number];

const LEGACY_TO_ACTIVE: Record<string, WorkspaceSection> = {
  growth: "growth",
  sources: "sources",
  pulse: "growth",
  diagnose: "growth",
  "ai-visibility": "growth",
  lab: "growth",
};

export function workspaceSectionFromValue(
  value: string | string[] | null | undefined,
): WorkspaceSection {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return "growth";
  return LEGACY_TO_ACTIVE[candidate] ?? "growth";
}

export function workspaceInsightFromValue(
  value: string | string[] | null | undefined,
  validInsightIds: readonly string[],
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && validInsightIds.includes(candidate)
    ? candidate
    : (validInsightIds[0] ?? "");
}
