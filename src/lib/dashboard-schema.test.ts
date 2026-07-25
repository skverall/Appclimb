import { describe, expect, it } from "vitest";

import {
  dashboardSnapshotSchema,
  isDashboardSnapshot,
} from "@/lib/dashboard-schema";
import { demoSnapshot } from "@/lib/demo-data";

describe("dashboardSnapshotSchema", () => {
  it("accepts the complete demo contract", () => {
    expect(isDashboardSnapshot(demoSnapshot)).toBe(true);
  });

  it("rejects a partial payload before the shell can hydrate", () => {
    expect(
      isDashboardSnapshot({
        workspaceName: "Partial workspace",
        stages: [],
        sources: [],
      }),
    ).toBe(false);
  });

  it("accepts nullable timestamps from the Go JSON response", () => {
    const snapshot = structuredClone(demoSnapshot);
    snapshot.sources[0].lastSyncAt = null;
    expect(dashboardSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });
});
