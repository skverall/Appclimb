export const WORKSPACE_SECTIONS = [
  "pulse",
  "diagnose",
  "lab",
  "sources",
] as const;

export type WorkspaceSection = (typeof WORKSPACE_SECTIONS)[number];

export function workspaceSectionFromValue(
  value: string | string[] | null | undefined,
): WorkspaceSection {
  const candidate = Array.isArray(value) ? value[0] : value;
  return WORKSPACE_SECTIONS.includes(candidate as WorkspaceSection)
    ? (candidate as WorkspaceSection)
    : "pulse";
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
