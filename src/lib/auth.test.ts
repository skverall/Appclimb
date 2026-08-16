import { beforeAll, describe, expect, it } from "vitest";

import {
  consumeMagicLink,
  createMagicLink,
  createSession,
  findUserByEmail,
  findUserByGoogleSub,
  findUserById,
  generateToken,
  getSessionByToken,
  hashToken,
  isValidEmail,
  MAGIC_LINK_TTL_MS,
  newId,
  normalizeEmail,
  revokeSessionByToken,
  SESSION_TTL_MS,
  upsertUser,
} from "@/lib/auth";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";
import { loadMigrationSql } from "../../tests/helpers/migration";

let db: FakeD1;

beforeAll(async () => {
  db = await createTestDb(loadMigrationSql());
});

describe("token + email primitives", () => {
  it("hashToken is deterministic 64-char hex", () => {
    const a = hashToken("secret");
    const b = hashToken("secret");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("other")).not.toBe(a);
  });

  it("generateToken produces url-safe unique values", () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
    expect(t1).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateToken(16).length).toBeLessThan(generateToken(32).length);
  });

  it("newId returns a uuid", () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("normalizeEmail lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Example.COM ")).toBe("foo@example.com");
  });

  it("isValidEmail accepts common addresses and rejects junk", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("user+tag@example.com")).toBe(true);
    expect(isValidEmail("no-at-sign.com")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("a b@c.com")).toBe(false);
    expect(isValidEmail("x".repeat(300) + "@b.co")).toBe(false);
  });
});

describe("users", () => {
  it("upsertUser creates then finds by email", async () => {
    const user = await upsertUser(db, { email: "Alice@Example.com", name: "Alice" });
    expect(user.email).toBe("alice@example.com");
    expect(user.name).toBe("Alice");

    const byEmail = await findUserByEmail(db, "alice@example.com");
    expect(byEmail?.id).toBe(user.id);
    expect(await findUserById(db, user.id)).toMatchObject({ id: user.id });
    expect(await findUserById(db, "missing")).toBeNull();
    expect(await findUserByEmail(db, "ghost@example.com")).toBeNull();
  });

  it("links a google sub to an existing same-email account", async () => {
    const before = await upsertUser(db, { email: "linkme@example.com" });
    expect(before.google_sub).toBeNull();
    const after = await upsertUser(db, { email: "linkme@example.com", googleSub: "g-123", name: "Linked" });
    expect(after.id).toBe(before.id);
    expect(after.google_sub).toBe("g-123");
    expect(after.name).toBe("Linked");

    const bySub = await findUserByGoogleSub(db, "g-123");
    expect(bySub?.id).toBe(before.id);
    expect(await findUserByGoogleSub(db, "g-none")).toBeNull();
  });

  it("creates a google-first user", async () => {
    const user = await upsertUser(db, { email: "g@example.com", googleSub: "g-999", emailVerified: true });
    expect(user.google_sub).toBe("g-999");
    expect(user.email_verified_at).not.toBeNull();
  });

  it("marks verified on an existing unverified account", async () => {
    const before = await upsertUser(db, { email: "verify@example.com" });
    expect(before.email_verified_at).toBeNull();
    const after = await upsertUser(db, { email: "verify@example.com", emailVerified: true });
    expect(after.email_verified_at).not.toBeNull();
  });
});

describe("sessions", () => {
  it("creates a session resolvable by its token", async () => {
    const user = await upsertUser(db, { email: "session@example.com" });
    const { token } = await createSession(db, user.id);
    const resolved = await getSessionByToken(db, token);
    expect(resolved?.user.id).toBe(user.id);
    expect(resolved?.session.user_id).toBe(user.id);
  });

  it("returns null for unknown or empty tokens", async () => {
    expect(await getSessionByToken(db, "not-a-real-token")).toBeNull();
    expect(await getSessionByToken(db, "")).toBeNull();
  });

  it("revoked sessions no longer resolve", async () => {
    const user = await upsertUser(db, { email: "revoke@example.com" });
    const { token } = await createSession(db, user.id);
    await revokeSessionByToken(db, token);
    expect(await getSessionByToken(db, token)).toBeNull();
    // Revoking again is a no-op.
    await revokeSessionByToken(db, token);
    await revokeSessionByToken(db, "");
  });

  it("expired sessions no longer resolve", async () => {
    const user = await upsertUser(db, { email: "expired@example.com" });
    const { token } = await createSession(db, user.id, -1_000);
    expect(await getSessionByToken(db, token)).toBeNull();
  });

  it("session ttl constants are sane", () => {
    expect(SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(MAGIC_LINK_TTL_MS).toBe(15 * 60 * 1000);
  });
});

describe("magic links", () => {
  it("issues and consumes a link exactly once", async () => {
    const { token } = await createMagicLink(db, "Magic@Example.com");
    expect(await consumeMagicLink(db, token)).toBe("magic@example.com");
    expect(await consumeMagicLink(db, token)).toBeNull();
  });

  it("expired links are rejected", async () => {
    const { token } = await createMagicLink(db, "late@example.com", -1_000);
    expect(await consumeMagicLink(db, token)).toBeNull();
  });

  it("unknown or empty tokens are rejected", async () => {
    expect(await consumeMagicLink(db, "nope")).toBeNull();
    expect(await consumeMagicLink(db, "")).toBeNull();
  });
});
