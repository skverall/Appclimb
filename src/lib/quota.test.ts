import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";

import { createSession, SESSION_COOKIE, upsertUser } from "@/lib/auth";
import { aiDailyLimit, popularityDailyLimit, resolveQuotaSubject } from "@/lib/quota";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";
import { loadMigrationSql } from "../../tests/helpers/migration";

let db: FakeD1;

beforeAll(async () => {
  db = await createTestDb(loadMigrationSql());
});

describe("daily limit helpers", () => {
  it("free tier caps popularity and AI", () => {
    expect(popularityDailyLimit("free")).toBe(30);
    expect(aiDailyLimit("free")).toBe(5);
  });

  it("pro tier raises both", () => {
    expect(popularityDailyLimit("pro")).toBe(500);
    expect(aiDailyLimit("pro")).toBe(200);
  });
});

describe("resolveQuotaSubject", () => {
  it("falls back to an ip-keyed free subject without a db", async () => {
    const request = new NextRequest("http://localhost/", {
      headers: { "cf-connecting-ip": "9.9.9.9" },
    });
    const subject = await resolveQuotaSubject(request, null);
    expect(subject.isSignedIn).toBe(false);
    expect(subject.plan).toBe("free");
    expect(subject.key).toBe("ip:9.9.9.9");
  });

  it("falls back to an ip-keyed free subject without a session", async () => {
    const request = new NextRequest("http://localhost/", {
      headers: { "cf-connecting-ip": "8.8.8.8" },
    });
    const subject = await resolveQuotaSubject(request, db);
    expect(subject.isSignedIn).toBe(false);
    expect(subject.key).toBe("ip:8.8.8.8");
  });

  it("resolves a signed-in user to a user-keyed subject", async () => {
    const user = await upsertUser(db, { email: "quota@example.com" });
    const { token } = await createSession(db, user.id);
    const request = new NextRequest("http://localhost/", {
      headers: { cookie: `${SESSION_COOKIE}=${token}`, "cf-connecting-ip": "7.7.7.7" },
    });
    const subject = await resolveQuotaSubject(request, db);
    expect(subject.isSignedIn).toBe(true);
    expect(subject.key).toBe(`user:${user.id}`);
    expect(subject.plan).toBe("free");
  });
});
