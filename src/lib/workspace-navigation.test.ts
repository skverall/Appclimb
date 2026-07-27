import { describe, expect, it } from "vitest";

import {
  workspaceInsightFromValue,
  workspaceSectionFromValue,
} from "./workspace-navigation";

describe("workspace navigation", () => {
  it("accepts Growth CI sections and maps legacy sections to growth", () => {
    expect(workspaceSectionFromValue("lab")).toBe("growth");
    expect(workspaceSectionFromValue(["sources", "pulse"])).toBe("sources");
    expect(workspaceSectionFromValue("admin")).toBe("growth");
    expect(workspaceSectionFromValue(undefined)).toBe("growth");
    expect(workspaceSectionFromValue("growth")).toBe("growth");
  });

  it("keeps only insight ids that belong to the loaded workspace", () => {
    const ids = ["insight-a", "insight-b"];

    expect(workspaceInsightFromValue("insight-b", ids)).toBe("insight-b");
    expect(workspaceInsightFromValue(["insight-a"], ids)).toBe("insight-a");
    expect(workspaceInsightFromValue("foreign-insight", ids)).toBe("insight-a");
    expect(workspaceInsightFromValue(undefined, [])).toBe("");
  });
});
