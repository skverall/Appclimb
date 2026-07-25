import { describe, expect, it } from "vitest";

import {
  workspaceInsightFromValue,
  workspaceSectionFromValue,
} from "./workspace-navigation";

describe("workspace navigation", () => {
  it("accepts supported sections and falls back to Pulse", () => {
    expect(workspaceSectionFromValue("lab")).toBe("lab");
    expect(workspaceSectionFromValue(["sources", "pulse"])).toBe("sources");
    expect(workspaceSectionFromValue("admin")).toBe("pulse");
    expect(workspaceSectionFromValue(undefined)).toBe("pulse");
  });

  it("keeps only insight ids that belong to the loaded workspace", () => {
    const ids = ["insight-a", "insight-b"];

    expect(workspaceInsightFromValue("insight-b", ids)).toBe("insight-b");
    expect(workspaceInsightFromValue(["insight-a"], ids)).toBe("insight-a");
    expect(workspaceInsightFromValue("foreign-insight", ids)).toBe("insight-a");
    expect(workspaceInsightFromValue(undefined, [])).toBe("");
  });
});
