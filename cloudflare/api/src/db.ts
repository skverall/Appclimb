import type { Identity, Workspace } from "./types";
import { nowISO, log } from "./runtime";

interface IdentityRow {
  user_id: string;
  email: string;
  avatar_key: string;
  workspace_id: string;
  workspace_name: string;
  role: string;
  trial_ends_at: string;
  subscription_status: string;
  password_hash?: string;
}

const identitySelect = `
  SELECT
    u.id AS user_id,
    u.email,
    u.avatar_key,
    w.id AS workspace_id,
    w.name AS workspace_name,
    wm.role,
    w.trial_ends_at,
    w.subscription_status,
    u.password_hash
  FROM users u
  JOIN workspace_members wm ON wm.user_id = u.id
  JOIN workspaces w ON w.id = wm.workspace_id
`;

function identityFromRow(row: IdentityRow): Identity {
  return {
    userId: row.user_id,
    email: row.email,
    avatarKey: row.avatar_key,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    role: row.role,
    trialEndsAt: row.trial_ends_at,
    subscriptionStatus: row.subscription_status,
  };
}

export async function findIdentityByEmail(
  db: D1Database,
  email: string,
): Promise<{ identity: Identity; passwordHash: string } | null> {
  const row = await db
    .prepare(
      `${identitySelect}
       WHERE u.email = ? COLLATE NOCASE
       ORDER BY wm.created_at
       LIMIT 1`,
    )
    .bind(email.trim().toLowerCase())
    .first<IdentityRow>();
  if (!row?.password_hash) {
    return null;
  }
  return { identity: identityFromRow(row), passwordHash: row.password_hash };
}

export async function findIdentity(
  db: D1Database,
  userId: string,
  workspaceId: string,
): Promise<Identity | null> {
  const row = await db
    .prepare(`${identitySelect} WHERE u.id = ? AND w.id = ? LIMIT 1`)
    .bind(userId, workspaceId)
    .first<IdentityRow>();
  return row ? identityFromRow(row) : null;
}

export async function createIdentity(
  db: D1Database,
  email: string,
  passwordHash: string,
  requestedWorkspaceName: string,
): Promise<Identity | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db
    .prepare("SELECT 1 AS present FROM users WHERE email = ? COLLATE NOCASE")
    .bind(normalizedEmail)
    .first<{ present: number }>();
  if (existing) {
    return null;
  }
  const now = new Date();
  const createdAt = now.toISOString();
  const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const workspaceName = requestedWorkspaceName.trim() || "My AppClimb workspace";
  const userId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const appId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO users(id,email,password_hash,avatar_key,created_at,updated_at)
         VALUES(?,?,?,'ridge',?,?)`,
      )
      .bind(userId, normalizedEmail, passwordHash, createdAt, createdAt),
    db
      .prepare(
        `INSERT INTO workspaces(
           id,name,owner_id,subscription_status,trial_ends_at,created_at,updated_at
         ) VALUES(?,?,?,'trialing',?,?,?)`,
      )
      .bind(workspaceId, workspaceName, userId, trialEndsAt, createdAt, createdAt),
    db
      .prepare(
        `INSERT INTO workspace_members(workspace_id,user_id,role,created_at)
         VALUES(?,?,'owner',?)`,
      )
      .bind(workspaceId, userId, createdAt),
    db
      .prepare(
        `INSERT INTO apps(
           id,workspace_id,name,platform,default_storefront,
           shared_app_user_id_confirmed,created_at,updated_at
         ) VALUES(?,?,'My iOS App','iOS','US',0,?,?)`,
      )
      .bind(appId, workspaceId, createdAt, createdAt),
    db
      .prepare(
        `INSERT INTO audit_events(
           id,workspace_id,actor_user_id,action,target_type,target_id,metadata,occurred_at
         ) VALUES(?,?,?,'workspace.created','workspace',?,'{}',?)`,
      )
      .bind(crypto.randomUUID(), workspaceId, userId, workspaceId, createdAt),
  ]);
  return {
    userId,
    email: normalizedEmail,
    avatarKey: "ridge",
    workspaceId,
    workspaceName,
    role: "owner",
    trialEndsAt,
    subscriptionStatus: "trialing",
  };
}

export async function createRefreshSession(
  db: D1Database,
  identity: Identity,
  familyId: string,
  tokenHash: Uint8Array,
  expiresAt: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO refresh_sessions(
        id,family_id,user_id,workspace_id,token_hash,expires_at,created_at
       ) VALUES(?,?,?,?,?,?,?)`,
    )
    .bind(
      crypto.randomUUID(),
      familyId,
      identity.userId,
      identity.workspaceId,
      tokenHash.buffer,
      expiresAt,
      nowISO(),
    )
    .run();
}

interface RefreshRow {
  id: string;
  family_id: string;
  user_id: string;
  workspace_id: string;
  expires_at: string;
  rotated_at: string | null;
  revoked_at: string | null;
}

export async function rotateRefreshSession(
  db: D1Database,
  oldHash: Uint8Array,
  newHash: Uint8Array,
  newExpiry: string,
): Promise<Identity | null> {
  const session = await db
    .prepare(
      `SELECT id,family_id,user_id,workspace_id,expires_at,rotated_at,revoked_at
       FROM refresh_sessions WHERE token_hash = ?`,
    )
    .bind(oldHash.buffer)
    .first<RefreshRow>();
  if (!session) {
    return null;
  }
  const now = nowISO();
  if (
    session.rotated_at ||
    session.revoked_at ||
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    await db
      .prepare(
        `UPDATE refresh_sessions
         SET revoked_at = COALESCE(revoked_at, ?)
         WHERE family_id = ?`,
      )
      .bind(now, session.family_id)
      .run();
    return null;
  }
  const identity = await findIdentity(db, session.user_id, session.workspace_id);
  if (!identity) {
    return null;
  }
  await db.batch([
    db
      .prepare(
        `UPDATE refresh_sessions SET rotated_at = ?
         WHERE id = ? AND rotated_at IS NULL AND revoked_at IS NULL`,
      )
      .bind(now, session.id),
    db
      .prepare(
        `INSERT INTO refresh_sessions(
          id,family_id,user_id,workspace_id,token_hash,expires_at,created_at
         ) VALUES(?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        session.family_id,
        session.user_id,
        session.workspace_id,
        newHash.buffer,
        newExpiry,
        now,
      ),
  ]);
  return identity;
}

export async function revokeRefreshFamily(
  db: D1Database,
  tokenHash: Uint8Array,
): Promise<void> {
  await db
    .prepare(
      `UPDATE refresh_sessions
       SET revoked_at = COALESCE(revoked_at, ?)
       WHERE family_id = (
         SELECT family_id FROM refresh_sessions WHERE token_hash = ?
       )`,
    )
    .bind(nowISO(), tokenHash.buffer)
    .run();
}

export async function workspaceFor(
  db: D1Database,
  userId: string,
  workspaceId: string,
): Promise<Workspace | null> {
  const row = await db
    .prepare(
      `SELECT
         w.id,
         w.name,
         w.subscription_status,
         w.trial_ends_at,
         w.entitlement_ends_at,
         a.id AS default_app_id,
         a.name AS default_app_name,
         a.default_storefront
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       JOIN apps a ON a.workspace_id = w.id
       WHERE w.id = ? AND wm.user_id = ?
       ORDER BY a.created_at
       LIMIT 1`,
    )
    .bind(workspaceId, userId)
    .first<{
      id: string;
      name: string;
      subscription_status: string;
      trial_ends_at: string;
      entitlement_ends_at: string | null;
      default_app_id: string;
      default_app_name: string;
      default_storefront: string;
    }>();
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    subscriptionStatus: row.subscription_status,
    trialEndsAt: row.trial_ends_at,
    ...(row.entitlement_ends_at
      ? { entitlementEndsAt: row.entitlement_ends_at }
      : {}),
    defaultAppId: row.default_app_id,
    defaultAppName: row.default_app_name,
    defaultStorefront: row.default_storefront,
  };
}

export function isEntitled(
  workspace: Pick<Workspace, "subscriptionStatus" | "trialEndsAt" | "entitlementEndsAt">,
  now = new Date(),
): boolean {
  if (
    ["active", "trialing"].includes(workspace.subscriptionStatus) &&
    new Date(workspace.trialEndsAt).getTime() > now.getTime()
  ) {
    return true;
  }
  if (
    ["active", "past_due", "paused"].includes(workspace.subscriptionStatus) &&
    workspace.entitlementEndsAt &&
    new Date(workspace.entitlementEndsAt).getTime() > now.getTime()
  ) {
    return true;
  }
  return workspace.subscriptionStatus === "active";
}

export async function audit(
  db: D1Database,
  workspaceId: string | null,
  userId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO audit_events(
          id,workspace_id,actor_user_id,action,target_type,target_id,metadata,occurred_at
         ) VALUES(?,?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        workspaceId,
        userId,
        action,
        targetType,
        targetId,
        JSON.stringify(metadata),
        nowISO(),
      )
      .run();
  } catch (error) {
    log("warn", "audit_write_failed", {
      action,
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}
