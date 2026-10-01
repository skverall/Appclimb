import { describe, expect, it } from "vitest";

import { checkMetadata, metadataFieldFor } from "@/lib/ai-metadata";

describe("metadataFieldFor", () => {
  it("maps fence languages to App Store fields", () => {
    expect(metadataFieldFor("title")).toBe("title");
    expect(metadataFieldFor("Subtitle")).toBe("subtitle");
    expect(metadataFieldFor("keyword-field")).toBe("keywords");
    expect(metadataFieldFor("keywords")).toBe("keywords");
    expect(metadataFieldFor("followups")).toBeNull();
    expect(metadataFieldFor("ts")).toBeNull();
  });
});

describe("checkMetadata", () => {
  it("counts characters against the field limit", () => {
    const ok = checkMetadata("title", "Car Dealer Tracker: Profit");
    expect(ok).toMatchObject({ length: 26, limit: 30, issues: [] });
    const long = checkMetadata("subtitle", "Inventory, Sales, Repairs & Profit Log");
    expect(long.length).toBe(38);
    expect(long.issues[0]).toBe("8 characters over the 30-character limit");
  });

  it("flags keyword-field waste and offers a fixed version", () => {
    const check = checkMetadata("keywords", "dealer, inventory,car lot,inventory,profit", {
      appName: "Car Dealer Tracker: Profit",
    });
    expect(check.issues).toEqual([
      "Spaces after commas waste 1 character",
      "Repeats inventory",
      "Already in your app name: dealer, car, profit",
      "Phrases cost spaces — Apple combines single words on its own",
    ]);
    expect(check.fixed).toBe("inventory,lot");
  });

  it("joins multi-line keyword blocks with commas", () => {
    const check = checkMetadata("keywords", "routine\nstreak\ngoals");
    expect(check.text).toBe("routine,streak,goals");
    expect(check.issues).toEqual([]);
    expect(check.fixed).toBeNull();
  });

  it("warns when a subtitle repeats the app name", () => {
    const check = checkMetadata("subtitle", "Profit tracker for dealers", {
      appName: "Car Dealer Tracker: Profit",
    });
    expect(check.issues).toEqual(["Repeats a word from your app name: profit, tracker"]);
  });
});
