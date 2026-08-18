import { beforeEach, describe, expect, it } from "vitest";

import {
  consumeDayUsage,
  EXPLORER_DAY_KEY,
  peekDayUsage,
  readDayUsage,
  refundDayUsage,
  todayStamp,
} from "@/lib/usage";

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
}

const NOW = new Date("2026-08-16T12:00:00.000Z");
const TOMORROW = new Date("2026-08-17T12:00:00.000Z");

describe("todayStamp", () => {
  it("formats a UTC date", () => {
    expect(todayStamp(NOW)).toBe("2026-08-16");
  });
});

describe("readDayUsage", () => {
  it("returns zero for an empty storage", () => {
    expect(readDayUsage(makeStorage(), EXPLORER_DAY_KEY, NOW)).toEqual({
      day: "2026-08-16",
      count: 0,
    });
  });

  it("reads a matching day", () => {
    const storage = makeStorage();
    storage.setItem(EXPLORER_DAY_KEY, JSON.stringify({ day: "2026-08-16", count: 3 }));
    expect(readDayUsage(storage, EXPLORER_DAY_KEY, NOW).count).toBe(3);
  });

  it("resets on a new day and ignores corrupt values", () => {
    const storage = makeStorage();
    storage.setItem(EXPLORER_DAY_KEY, JSON.stringify({ day: "2026-08-15", count: 7 }));
    expect(readDayUsage(storage, EXPLORER_DAY_KEY, NOW).count).toBe(0);
    storage.setItem(EXPLORER_DAY_KEY, "{not json");
    expect(readDayUsage(storage, EXPLORER_DAY_KEY, NOW).count).toBe(0);
    storage.setItem(EXPLORER_DAY_KEY, JSON.stringify({ day: "2026-08-16", count: -2 }));
    expect(readDayUsage(storage, EXPLORER_DAY_KEY, NOW).count).toBe(0);
  });
});

describe("consumeDayUsage", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = makeStorage();
  });

  it("unlimited plans always pass", () => {
    const result = consumeDayUsage(storage, EXPLORER_DAY_KEY, null, NOW);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Number.POSITIVE_INFINITY);
    expect(peekDayUsage(storage, EXPLORER_DAY_KEY, NOW)).toBe(0);
  });

  it("counts up to the limit then blocks", () => {
    for (let i = 0; i < 8; i += 1) {
      expect(consumeDayUsage(storage, EXPLORER_DAY_KEY, 8, NOW).allowed).toBe(true);
    }
    expect(peekDayUsage(storage, EXPLORER_DAY_KEY, NOW)).toBe(8);
    const blocked = consumeDayUsage(storage, EXPLORER_DAY_KEY, 8, NOW);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("reports remaining capacity", () => {
    expect(consumeDayUsage(storage, EXPLORER_DAY_KEY, 8, NOW).remaining).toBe(7);
    expect(consumeDayUsage(storage, EXPLORER_DAY_KEY, 8, NOW).remaining).toBe(6);
  });

  it("marks the counter as consumed only when the write succeeds", () => {
    expect(consumeDayUsage(storage, EXPLORER_DAY_KEY, 8, NOW).consumed).toBe(true);
    expect(consumeDayUsage(storage, EXPLORER_DAY_KEY, null, NOW).consumed).toBe(false);
    const blocked = consumeDayUsage(storage, EXPLORER_DAY_KEY, 8, NOW);
    expect(blocked.allowed).toBe(true);
    expect(blocked.consumed).toBe(true);
  });

  it("resets on the next day", () => {
    for (let i = 0; i < 8; i += 1) consumeDayUsage(storage, EXPLORER_DAY_KEY, 8, NOW);
    expect(consumeDayUsage(storage, EXPLORER_DAY_KEY, 8, NOW).allowed).toBe(false);
    expect(consumeDayUsage(storage, EXPLORER_DAY_KEY, 8, TOMORROW).allowed).toBe(true);
  });
});

describe("refundDayUsage", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = makeStorage();
  });

  it("reverses one unit of today's count", () => {
    for (let i = 0; i < 3; i += 1) consumeDayUsage(storage, EXPLORER_DAY_KEY, 8, NOW);
    expect(peekDayUsage(storage, EXPLORER_DAY_KEY, NOW)).toBe(3);
    refundDayUsage(storage, EXPLORER_DAY_KEY, NOW);
    expect(peekDayUsage(storage, EXPLORER_DAY_KEY, NOW)).toBe(2);
  });

  it("never ticks below zero", () => {
    refundDayUsage(storage, EXPLORER_DAY_KEY, NOW);
    expect(peekDayUsage(storage, EXPLORER_DAY_KEY, NOW)).toBe(0);
  });

  it("does not touch a previous day's count", () => {
    consumeDayUsage(storage, EXPLORER_DAY_KEY, 8, NOW);
    expect(peekDayUsage(storage, EXPLORER_DAY_KEY, TOMORROW)).toBe(0);
    refundDayUsage(storage, EXPLORER_DAY_KEY, TOMORROW);
    expect(peekDayUsage(storage, EXPLORER_DAY_KEY, TOMORROW)).toBe(0);
  });
});
