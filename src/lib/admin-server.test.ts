import { describe, expect, it } from "vitest";

import { adminOptOutResponse } from "@/lib/admin-server";

describe("adminOptOutResponse", () => {
  it("records nothing and tags the browser as the founder's", () => {
    const response = adminOptOutResponse();
    expect(response.status).toBe(204);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("appclimb_admin_optout=1");
    expect(cookie).toContain("Max-Age=31536000");
  });
});
