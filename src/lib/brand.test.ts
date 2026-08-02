import { describe, expect, it } from "vitest";

import { ICON_VERSION, ICONS_V2, iconUrl } from "@/lib/brand";

describe("brand icon URLs", () => {
  it("version-busts icon paths under /icons/v2", () => {
    expect(ICONS_V2).toBe("/icons/v2");
    expect(iconUrl("favicon.ico")).toBe(
      `/icons/v2/favicon.ico?v=${ICON_VERSION}`,
    );
    expect(iconUrl("icon-512.png")).toContain("icon-512.png");
    expect(iconUrl("apple-touch-icon.png")).toContain(ICON_VERSION);
  });
});
