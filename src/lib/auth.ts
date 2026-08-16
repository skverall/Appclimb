/**
 * Server-only authentication primitives (ADR 0004): users, hashed session
 * tokens, and email magic links, all backed by the `DB` D1 binding.
 *
 * Sessions are random 32-byte tokens. Only their SHA-256 hash is stored, so a
 * database leak does not reveal usable session credentials. The raw token is
 * delivered to the browser as an HttpOnly cookie (see routes).
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "appclimb_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  google_sub: string | null;
  email_verified_at: string | null;
  created_at: string;
  last_seen_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface MagicLinkRow {
  id: string;
  email: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function newId(): string {
  return randomUUID();
}

/** Normalize an email for storage/lookup (lowercase, trimmed). */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  if (email.length < 3 || email.length > 254) return false;
  // Pragmatic check, not full RFC 5322.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT * FROM users WHERE email = ?")
    .bind(normalizeEmail(email))
    .first<UserRow>();
  return row ?? null;
}

export async function findUserByGoogleSub(db: D1Database, sub: string): Promise<UserRow | null> {
  const row = await db.prepare("SELECT * FROM users WHERE google_sub = ?").bind(sub).first<UserRow>();
  return row ?? null;
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  const row = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  return row ?? null;
}

export interface UpsertUserInput {
  email: string;
  name?: string | null;
  googleSub?: string | null;
  emailVerified?: boolean;
}

/**
 * Find a user by email (or Google subject) or create one. Links a Google
 * subject to an existing same-email account when both are present.
 */
export async function upsertUser(db: D1Database, input: UpsertUserInput): Promise<UserRow> {
  const email = normalizeEmail(input.email);
  const existing = await findUserByEmail(db, email);
  const now = new Date().toISOString();

  if (existing) {
    const needsGoogleLink = input.googleSub && existing.google_sub !== input.googleSub;
    const needsVerified = input.emailVerified && !existing.email_verified_at;
    if (needsGoogleLink || needsVerified || input.name) {
      await db
        .prepare(
          `UPDATE users SET
             google_sub = COALESCE(?, google_sub),
             email_verified_at = COALESCE(?, email_verified_at),
             name = COALESCE(?, name),
             last_seen_at = ?
           WHERE id = ?`,
        )
        .bind(
          needsGoogleLink ? input.googleSub : null,
          needsVerified ? now : null,
          input.name ?? null,
          now,
          existing.id,
        )
        .run();
    } else {
      await db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now, existing.id).run();
    }
    return (await findUserById(db, existing.id)) as UserRow;
  }

  const id = newId();
  await db
    .prepare(
      `INSERT INTO users (id, email, name, google_sub, email_verified_at, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      email,
      input.name ?? null,
      input.googleSub ?? null,
      input.emailVerified ? now : null,
      now,
      now,
    )
    .run();
  return (await findUserById(db, id)) as UserRow;
}

export async function createSession(
  db: D1Database,
  userId: string,
  ttlMs: number = SESSION_TTL_MS,
): Promise<{ token: string; sessionId: string }> {
  const token = generateToken();
  const sessionId = newId();
  const now = new Date();
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      sessionId,
      userId,
      hashToken(token),
      now.toISOString(),
      new Date(now.getTime() + ttlMs).toISOString(),
    )
    .run();
  return { token, sessionId };
}

/** Resolve a raw session token to a live session + user, or null. */
export async function getSessionByToken(
  db: D1Database,
  token: string,
): Promise<{ session: SessionRow; user: UserRow } | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await db
    .prepare("SELECT * FROM sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .first<SessionRow>();
  if (!session) return null;
  if (session.revoked_at) return null;
  const expires = Date.parse(session.expires_at);
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;

  const user = await findUserById(db, session.user_id);
  if (!user) return null;

  // Constant-time sanity check on the hash lookup (defense in depth).
  if (!safeEqualHex(session.token_hash, tokenHash)) return null;

  return { session, user };
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function revokeSessionByToken(db: D1Database, token: string): Promise<void> {
  if (!token) return;
  await db
    .prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
    .bind(new Date().toISOString(), hashToken(token))
    .run();
}

/**
 * Create a magic link for an email. The returned `token` is sent by email;
 * only its hash is stored.
 */
export async function createMagicLink(
  db: D1Database,
  email: string,
  ttlMs: number = MAGIC_LINK_TTL_MS,
): Promise<{ token: string; id: string }> {
  const token = generateToken();
  const id = newId();
  const now = new Date();
  await db
    .prepare(
      `INSERT INTO magic_links (id, email, token_hash, created_at, expires_at, used_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      id,
      normalizeEmail(email),
      hashToken(token),
      now.toISOString(),
      new Date(now.getTime() + ttlMs).toISOString(),
    )
    .run();
  return { token, id };
}

/**
 * Consume a magic link token. Returns the email it was issued for, or null if
 * the token is unknown, expired, or already used. Marks it used atomically.
 */
export async function consumeMagicLink(db: D1Database, token: string): Promise<string | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const link = await db
    .prepare("SELECT * FROM magic_links WHERE token_hash = ?")
    .bind(tokenHash)
    .first<MagicLinkRow>();
  if (!link) return null;
  if (link.used_at) return null;
  const expires = Date.parse(link.expires_at);
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;

  const usedAt = new Date().toISOString();
  const result = await db
    .prepare("UPDATE magic_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL")
    .bind(usedAt, tokenHash)
    .run();
  // If no row changed, a concurrent request already consumed it.
  if (result.meta.changes === 0) return null;
  return link.email;
}
