import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isAdminEmail } from "./admin";

describe("isAdminEmail", () => {
  const originalEnv = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_EMAILS = originalEnv;
    } else {
      delete process.env.ADMIN_EMAILS;
    }
  });

  it("handles null, undefined, and empty email", () => {
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
    expect(isAdminEmail("   ")).toBe(false);
  });

  it("authorizes configured ADMIN_EMAILS environment list", () => {
    process.env.ADMIN_EMAILS = "founder@appclimb.app, ceo@company.com";
    expect(isAdminEmail("founder@appclimb.app")).toBe(true);
    expect(isAdminEmail("CEO@COMPANY.COM")).toBe(true);
    expect(isAdminEmail("intruder@random.com")).toBe(false);
  });

  it("authorizes fallback domain patterns when ADMIN_EMAILS is unset", () => {
    expect(isAdminEmail("aydmaxx@gmail.com")).toBe(true);
    expect(isAdminEmail("admin@appclimb.app")).toBe(true);
    expect(isAdminEmail("shokhabbos@gmail.com")).toBe(true);
    expect(isAdminEmail("team@appclimb.app")).toBe(true);
    expect(isAdminEmail("guest@other.com")).toBe(false);
  });
});
