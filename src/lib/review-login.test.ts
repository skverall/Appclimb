import { execFileSync } from "node:child_process";
import { pbkdf2Sync } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { findUserByEmail, upsertUser } from "@/lib/auth";
import { getPlanForUser } from "@/lib/entitlement";
import {
  isReviewAccount,
  parsePasswordHash,
  readReviewLoginConfig,
  reviewSignIn,
  verifyReviewPassword,
} from "@/lib/review-login";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";
import { loadMigrationSql } from "../../tests/helpers/migration";

const EMAIL = "review@appclimb.app";
const PASSWORD = "correct-horse-battery-staple-42";

/** Same format as scripts/hash-review-password.mjs, with fewer iterations to keep tests fast. */
function hashFor(password: string, iterations = 10_000, salt = Buffer.alloc(16, 7)): string {
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  return `pbkdf2-sha256$${iterations}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

const HASH = hashFor(PASSWORD);

let db: FakeD1;

beforeAll(async () => {
  db = await createTestDb(loadMigrationSql());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function configure(email = EMAIL, hash = HASH) {
  vi.stubEnv("REVIEW_LOGIN_EMAIL", email);
  vi.stubEnv("REVIEW_LOGIN_PASSWORD_HASH", hash);
}

describe("parsePasswordHash", () => {
  it("accepts the script's format", () => {
    expect(parsePasswordHash(HASH)).toMatchObject({ iterations: 10_000 });
  });

  it("rejects other schemes, weak or out-of-range iterations and short salts", () => {
    expect(parsePasswordHash("")).toBeNull();
    expect(parsePasswordHash(HASH.replace("pbkdf2-sha256", "pbkdf2-sha1"))).toBeNull();
    expect(parsePasswordHash(hashFor(PASSWORD, 1_000))).toBeNull();
    expect(parsePasswordHash(hashFor(PASSWORD, 200_000))).toBeNull();
    expect(parsePasswordHash(hashFor(PASSWORD, 10_000, Buffer.alloc(8, 1)))).toBeNull();
    expect(parsePasswordHash(`${HASH}$extra`)).toBeNull();
    expect(parsePasswordHash(HASH.replace(/\$[^$]+$/u, "$not*base64"))).toBeNull();
  });
});

describe("readReviewLoginConfig", () => {
  it("is off unless both secrets are set and valid", () => {
    expect(readReviewLoginConfig()).toBeNull();
    configure("not-an-email");
    expect(readReviewLoginConfig()).toBeNull();
    configure(EMAIL, "plain-password");
    expect(readReviewLoginConfig()).toBeNull();
  });

  it("normalizes the email", () => {
    configure("  Review@AppClimb.app ");
    expect(readReviewLoginConfig()).toEqual({ email: EMAIL, passwordHash: HASH });
  });
});

describe("verifyReviewPassword", () => {
  it("accepts the right password and nothing else", async () => {
    expect(await verifyReviewPassword(PASSWORD, HASH)).toBe(true);
    expect(await verifyReviewPassword(`${PASSWORD}x`, HASH)).toBe(false);
    expect(await verifyReviewPassword("", HASH)).toBe(false);
    expect(await verifyReviewPassword(PASSWORD, "garbage")).toBe(false);
  });

  it("verifies what scripts/hash-review-password.mjs prints", async () => {
    const stored = execFileSync(process.execPath, ["scripts/hash-review-password.mjs"], {
      input: `${PASSWORD}\n`,
    }).toString();
    expect(parsePasswordHash(stored)).toMatchObject({ iterations: 100_000 });
    expect(await verifyReviewPassword(PASSWORD, stored)).toBe(true);
  });

  it("the script refuses a short password", () => {
    expect(() =>
      execFileSync(process.execPath, ["scripts/hash-review-password.mjs"], { input: "short", stdio: "pipe" }),
    ).toThrow();
  });
});

describe("reviewSignIn", () => {
  const config = { email: EMAIL, passwordHash: HASH };

  it("refuses a wrong email or password without creating a user", async () => {
    expect(await reviewSignIn(db, config, "someone@example.com", PASSWORD)).toBeNull();
    expect(await reviewSignIn(db, config, EMAIL, "wrong-password")).toBeNull();
    expect(await findUserByEmail(db, EMAIL)).toBeNull();
  });

  it("creates the reviewer once, never email-verified, and signs it in again", async () => {
    const first = await reviewSignIn(db, config, " Review@AppClimb.app", PASSWORD);
    expect(first).toMatchObject({ email: EMAIL, email_verified_at: null });
    const again = await reviewSignIn(db, config, EMAIL, PASSWORD);
    expect(again?.id).toBe(first?.id);
  });
});

describe("reviewer plan", () => {
  it("is Pro for the configured reviewer only", async () => {
    const reviewer = await upsertUser(db, { email: "plan-review@appclimb.app" });
    const other = await upsertUser(db, { email: "plan-other@example.com" });
    expect(await getPlanForUser(db, reviewer.id)).toBe("free");

    configure("plan-review@appclimb.app");
    expect(await isReviewAccount(db, reviewer.id)).toBe(true);
    expect(await getPlanForUser(db, reviewer.id)).toBe("pro");
    expect(await getPlanForUser(db, other.id)).toBe("free");
    expect(await isReviewAccount(db, "no-such-user")).toBe(false);
  });
});
