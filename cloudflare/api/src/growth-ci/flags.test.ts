import { describe, expect, it } from "vitest";
import { readGrowthCiFlags } from "./flags";

describe("readGrowthCiFlags", () => {
  it("defaults all flags off for production-safe posture", () => {
    expect(readGrowthCiFlags({})).toEqual({
      growthCiEnabled: false,
      agentBridgeEnabled: false,
      legacySurfacesEnabled: false,
    });
  });

  it("parses staging-style enablement", () => {
    expect(
      readGrowthCiFlags({
        GROWTH_CI_ENABLED: "true",
        AGENT_BRIDGE_ENABLED: "1",
        LEGACY_SURFACES_ENABLED: "off",
      }),
    ).toEqual({
      growthCiEnabled: true,
      agentBridgeEnabled: true,
      legacySurfacesEnabled: false,
    });
  });

  it("respects custom defaults for local tests", () => {
    expect(
      readGrowthCiFlags(
        {},
        {
          growthCiEnabled: true,
          agentBridgeEnabled: true,
          legacySurfacesEnabled: false,
        },
      ),
    ).toMatchObject({ growthCiEnabled: true, agentBridgeEnabled: true });
  });
});
