import { NextRequest, NextResponse } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";

import { createSession, SESSION_COOKIE, upsertUser } from "@/lib/auth";
import {
  clearSessionCookie,
  getCurrentSession,
  readSessionToken,
  sessionCookieOptions,
  setSessionCookie,
  signOut,
} from "@/lib/session";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";
import { loadMigrationSql } from "../../tests/helpers/migration";

let db: FakeD1;

beforeAll(async () => {
  db = await createTestDb(loadMigrationSql());
});

function makeRequest(url = "http://localhost/", cookie = ""): NextRequest {
  return new NextRequest(url, cookie ? { headers: { cookie } } : {});
}

describe("sessionCookieOptions", () => {
  it("is not secure for plain http", () => {
    const opts = sessionCookieOptions(makeRequest("http://localhost/"));
    expect(opts.secure).toBe(false);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.maxAge).toBeGreaterThan(0);
  });

  it("is secure for https", () => {
    const opts = sessionCookieOptions(makeRequest("https://appclimb.app/"));
    expect(opts.secure).toBe(true);
  });
});

describe("readSessionToken", () => {
  it("returns the cookie value", () => {
    expect(readSessionToken(makeRequest("http://x/", `${SESSION_COOKIE}=tok123`))).toBe("tok123");
  });

  it("returns empty string when absent", () => {
    expect(readSessionToken(makeRequest("http://x/"))).toBe("");
  });
});

describe("cookie writing", () => {
  it("setSessionCookie writes the session cookie", () => {
    const request = makeRequest("https://appclimb.app/");
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, "tok", request);
    const cookie = response.cookies.get(SESSION_COOKIE);
    expect(cookie?.value).toBe("tok");
    expect(cookie?.httpOnly).toBe(true);
  });

  it("clearSessionCookie expires the cookie", () => {
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    const cookie = response.cookies.get(SESSION_COOKIE);
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
  });
});

describe("getCurrentSession", () => {
  it("resolves a valid session cookie to the user", async () => {
    const user = await upsertUser(db, { email: "current@example.com" });
    const { token } = await createSession(db, user.id);
    const current = await getCurrentSession(makeRequest("http://x/", `${SESSION_COOKIE}=${token}`), db);
    expect(current?.user.id).toBe(user.id);
  });

  it("returns null without a cookie", async () => {
    expect(await getCurrentSession(makeRequest("http://x/"), db)).toBeNull();
  });

  it("returns null for an invalid cookie", async () => {
    expect(await getCurrentSession(makeRequest("http://x/", `${SESSION_COOKIE}=bogus`), db)).toBeNull();
  });
});

describe("signOut", () => {
  it("revokes the session referenced by the cookie", async () => {
    const user = await upsertUser(db, { email: "signout@example.com" });
    const { token } = await createSession(db, user.id);
    const request = makeRequest("http://x/", `${SESSION_COOKIE}=${token}`);
    await signOut(request, db);
    expect(await getCurrentSession(request, db)).toBeNull();
  });

  it("is a no-op without a cookie", async () => {
    await expect(signOut(makeRequest("http://x/"), db)).resolves.toBeUndefined();
  });
});
