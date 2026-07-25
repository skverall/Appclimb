import { describe, expect, it } from "vitest";

import { isAcquisitionEnvelope } from "@/lib/acquisition";
import {
  demoAcquisitionSnapshot,
  emptyAcquisitionSnapshot,
} from "@/lib/acquisition-demo";

describe("acquisition snapshots", () => {
  it("keeps demo data explicitly synthetic", () => {
    expect(demoAcquisitionSnapshot.mode).toBe("demo");
    expect(demoAcquisitionSnapshot.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "AI Referral" }),
        expect.objectContaining({ label: "Social" }),
      ]),
    );
  });

  it("creates a truthful zero state", () => {
    const empty = emptyAcquisitionSnapshot();
    expect(empty.mode).toBe("empty");
    expect(empty.property).toBeUndefined();
    expect(empty.totals.pageviews).toBe(0);
  });

  it("accepts backend envelopes with the required shape", () => {
    const data = Object.fromEntries(
      Object.entries(demoAcquisitionSnapshot).filter(
        ([key]) => key !== "mode" && key !== "windowDays",
      ),
    );
    expect(
      isAcquisitionEnvelope({
        data,
        meta: { mode: "live", windowDays: 7 },
      }),
    ).toBe(true);
  });
});
