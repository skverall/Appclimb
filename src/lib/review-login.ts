/**
 * Password sign-in for app-directory reviewers (docs/mcp-directory-submissions.md).
 *
 * Claude's and ChatGPT's directory reviewers must sign in with an email and a
 * password, without email links or MFA, but AppClimb accounts sign in only
 * with Google or a magic link. This adds exactly one password account, set by
 * two Worker secrets; with either missing the feature does not exist.
 *
 * - The account gets Pro (see entitlement.ts), so a review never runs out of
 *   daily checks.
 * - It is never marked email-verified: the password proves knowledge of a
 *   secret, not ownership of the mailbox, and an unverified account gets no
 *   weekly email.
 *
 * The stored hash is `pbkdf2-sha256$<iterations>$<salt>$<hash>` (base64url),
 * made with scripts/hash-review-password.mjs. Verification uses WebCrypto,
 * which on Workers allows at most 100,000 PBKDF2 iterations.
 */
import { timingSafeEqual } from "node:crypto";

import { findUserById, isValidEmail, normalizeEmail, upsertUser, type UserRow } from "./auth";

export interface ReviewLoginConfig {
  email: string;
  passwordHash: string;
}

interface ParsedHash {
  iterations: number;
  salt: Uint8Array<ArrayBuffer>;
  hash: Uint8Array<ArrayBuffer>;
}

const MAX_ITERATIONS = 100_000;
const MIN_ITERATIONS = 10_000;

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  return new Uint8Array(Buffer.from(value, "base64url"));
}

export function parsePasswordHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return null;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return null;
  const salt = fromBase64Url(parts[2]);
  const hash = fromBase64Url(parts[3]);
  if (!salt || salt.length < 16 || !hash || hash.length !== 32) return null;
  return { iterations, salt, hash };
}

export function readReviewLoginConfig(): ReviewLoginConfig | null {
  const email = normalizeEmail(process.env.REVIEW_LOGIN_EMAIL ?? "");
  const passwordHash = (process.env.REVIEW_LOGIN_PASSWORD_HASH ?? "").trim();
  if (!isValidEmail(email) || !parsePasswordHash(passwordHash)) return null;
  return { email, passwordHash };
}

export async function verifyReviewPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parsePasswordHash(stored);
  if (!parsed || password.length === 0 || password.length > 256) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: parsed.salt, iterations: parsed.iterations },
    key,
    parsed.hash.length * 8,
  );
  return timingSafeEqual(new Uint8Array(bits), parsed.hash);
}

/**
 * The reviewer's user for a correct email and password, created on first
 * sign-in; null otherwise. A wrong email is refused before any hashing.
 */
export async function reviewSignIn(
  db: D1Database,
  config: ReviewLoginConfig,
  email: string,
  password: string,
): Promise<UserRow | null> {
  if (normalizeEmail(email) !== config.email) return null;
  if (!(await verifyReviewPassword(password, config.passwordHash))) return null;
  return upsertUser(db, { email: config.email, emailVerified: false });
}

/** Whether `userId` is the configured reviewer account. */
export async function isReviewAccount(db: D1Database, userId: string): Promise<boolean> {
  const config = readReviewLoginConfig();
  if (!config) return false;
  const user = await findUserById(db, userId);
  return user !== null && normalizeEmail(user.email) === config.email;
}
