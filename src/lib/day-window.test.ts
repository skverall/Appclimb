import { describe, expect, it } from "vitest";

import { nextUtcMidnightMs, utcDayStartMs } from "./day-window";

describe("utcDayStartMs", () => {
  it("aligns any time of day to the start of its UTC calendar day", () => {
    expect(utcDayStartMs(Date.UTC(2026, 7, 18, 23, 30, 0))).toBe(
      Date.UTC(2026, 7, 18, 0, 0, 0),
    );
    expect(utcDayStartMs(Date.UTC(2026, 7, 18, 0, 0, 0))).toBe(
      Date.UTC(2026, 7, 18, 0, 0, 0),
    );
    expect(utcDayStartMs(Date.UTC(2026, 0, 1, 12, 0, 0))).toBe(
      Date.UTC(2026, 0, 1, 0, 0, 0),
    );
  });
});

describe("nextUtcMidnightMs", () => {
  it("returns the next UTC midnight, even exactly at midnight", () => {
    expect(nextUtcMidnightMs(Date.UTC(2026, 7, 18, 23, 30, 0))).toBe(
      Date.UTC(2026, 7, 19, 0, 0, 0),
    );
    expect(nextUtcMidnightMs(Date.UTC(2026, 7, 18, 0, 0, 0))).toBe(
      Date.UTC(2026, 7, 19, 0, 0, 0),
    );
    expect(nextUtcMidnightMs(Date.UTC(2026, 11, 31, 23, 59, 59))).toBe(
      Date.UTC(2027, 0, 1, 0, 0, 0),
    );
  });
});
