import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  addAppStoreApp,
  addKeywordTrack,
  addWebApp,
  deleteWorkspaceApp,
  listKeywordTracks,
  listWorkspaceApps,
  recordKeywordObservations,
  sanitizeClientAppMetadata,
  sanitizeWebAppMetadata,
  updateWorkspaceApp,
} from "./apps-keywords";
import {
  addAiVisibilityPrompt,
  aiVisibilitySnapshot,
  processAiVisibilityMessage,
  queueAiVisibilityScan,
  queueDueAiVisibilityScans,
  removeAiVisibilityPrompt,
  setupAiVisibility,
  updateAiVisibilityCadence,
  type AiVisibilityMessage,
} from "./ai-visibility";
import {
  billingConfigured,
  createCheckoutBinding,
  parseSubscriptionUpdate,
  recordBillingEvent,
  redactCheckoutBinding,
  verifyPaddleSignature,
} from "./billing";
import {
  createIdentity,
  createRefreshSession,
  findIdentity,
  findIdentityByEmail,
  isEntitled,
  revokeRefreshFamily,
  rotateRefreshSession,
  workspaceFor,
  audit,
} from "./db";
import {
  hashPassword,
  issueAccessToken,
  randomToken,
  sha256,
  verifyPassword,
} from "./crypto";
import { ProviderError, isSupportedProvider, verifyProvider } from "./connectors";
import {
  createExperiment,
  deleteExperiment,
  listExperiments,
  recordProposalFeedback,
  updateExperiment,
} from "./experiments";
import { recordProductEvents } from "./product-events";
import { growthMapSnapshot } from "./growth-map";
import {
  connectSource,
  deleteSource,
  listSources,
  postHogEventOptions,
  queueDueSyncs,
  queueSourceSync,
  updatePostHogEvents,
} from "./sources";
import { passwordResetEmail } from "./mail-templates";
import {
  asBoolean,
  log,
  nowISO,
  requireSecret,
} from "./runtime";
import { processSyncMessage } from "./sync";
import type { AppEnvironment, Identity } from "./types";
import {
  createProperty,
  deleteExpiredAnalytics,
  recordCrawlerEvent,
  recordWebEvent,
  saveConversionGoal,
  saveInstallStep,
  webAnalyticsSnapshot,
  webInstallSnapshot,
} from "./web-analytics";
import {
  areLegacySurfacesEnabled,
  isAgentBridgeEnabled,
  isGrowthCiEnabled,
  readGrowthCiFlags,
} from "./growth-ci/flags";
import {
  processReleaseCheckMessage,
  queueDueReleaseChecks,
  recoverStaleReleaseChecks,
} from "./growth-ci/checks";
import {
  authenticateAgentToken,
  agentHasScope,
  createAgentToken,
  listAgentTokens,
  revokeAgentToken,
  getAgentStatus,
  getNextAgentTask,
  claimAgentTask,
  reportAgentTaskEvent,
  reportAgentRelease,
  getTaskVerification,
} from "./growth-ci/agent-bridge";
import {
  growthCiWorkspaceSnapshot,
  dismissGrowthIncident,
} from "./growth-ci/workspace";
import { ensureGrowthContract, updateContractMeasurement } from "./growth-ci/contracts";
import { discoverVersionCandidatesForApp } from "./growth-ci/version-discovery";
import { assessGrowthCiAccess } from "./growth-ci/entitlement";
import type { ReleaseCheckMessage } from "./growth-ci/types";

const app = new Hono<AppEnvironment>();

function errorResponse(
  c: Parameters<Parameters<typeof app.onError>[0]>[1],
  code: string,
  status: ContentfulStatusCode,
) {
  return c.json({ error: code }, status);
}

async function jsonBody(
  request: Request,
  maxBytes = 64 * 1024,
): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    throw new Error("request_too_large");
  }
  const text = await request.text();
  if (!text || new TextEncoder().encode(text).length > maxBytes) {
    throw new Error("invalid_json");
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid_json");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new Error("invalid_json");
  }
}

function validEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)
  );
}

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

async function issueTokens(
  env: Cloudflare.Env,
  identity: Identity,
  familyId = crypto.randomUUID(),
): Promise<Record<string, unknown>> {
  const now = new Date();
  const jwt = await issueAccessToken(
    requireSecret(env, "JWT_SECRET"),
    identity.userId,
    identity.workspaceId,
    identity.role,
    now,
  );
  const refreshToken = randomToken(48);
  const refreshTokenExpiresAt = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  await createRefreshSession(
    env.DB,
    identity,
    familyId,
    await sha256(refreshToken),
    refreshTokenExpiresAt,
  );
  return {
    accessToken: jwt.token,
    refreshToken,
    accessTokenExpiresAt: jwt.expiresAt,
    refreshTokenExpiresAt,
  };
}

function requestKey(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

const requestContext = createMiddleware<AppEnvironment>(async (c, next) => {
  const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  const startedAt = Date.now();
  await next();
  c.header("x-request-id", requestId);
  log("info", "http_request", {
    requestId,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    durationMs: Date.now() - startedAt,
  });
});

const cors = createMiddleware<AppEnvironment>(async (c, next) => {
  const origin = c.req.header("origin");
  const allowed = new Set(
    c.env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()),
  );
  if (origin && allowed.has(origin)) {
    c.header("access-control-allow-origin", origin);
    c.header("vary", "Origin");
    c.header(
      "access-control-allow-headers",
      "Authorization, Content-Type, Paddle-Signature, X-AppClimb-Original-User-Agent",
    );
    c.header(
      "access-control-allow-methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    c.header("access-control-max-age", "600");
  }
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
});

const authRateLimit = createMiddleware<AppEnvironment>(async (c, next) => {
  const result = await c.env.AUTH_RATE_LIMITER.limit({
    key: `auth:${requestKey(c)}`,
  });
  if (!result.success) {
    return errorResponse(c, "rate_limited", 429);
  }
  await next();
});

const collectorRateLimit = createMiddleware<AppEnvironment>(async (c, next) => {
  const result = await c.env.COLLECTOR_RATE_LIMITER.limit({
    key: `collector:${requestKey(c)}`,
  });
  if (!result.success) {
    return errorResponse(c, "rate_limited", 429);
  }
  await next();
});

const aiVisibilityRateLimit = createMiddleware<AppEnvironment>(
  async (c, next) => {
    const auth = c.get("auth");
    const result = await c.env.AI_RATE_LIMITER.limit({
      key: `ai-visibility:${auth.workspaceId}`,
    });
    if (!result.success) {
      return errorResponse(c, "rate_limited", 429);
    }
    await next();
  },
);

const requireAuth = createMiddleware<AppEnvironment>(async (c, next) => {
  const authorization = c.req.header("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return errorResponse(c, "unauthorized", 401);
  }
  try {
    const { parseAccessToken } = await import("./crypto");
    const claims = await parseAccessToken(
      requireSecret(c.env, "JWT_SECRET"),
      authorization.slice(7),
    );
    c.set("auth", {
      userId: claims.sub,
      workspaceId: claims.wid,
      role: claims.role,
    });
    await next();
  } catch {
    return errorResponse(c, "unauthorized", 401);
  }
});

const requireEntitlement = createMiddleware<AppEnvironment>(async (c, next) => {
  const current = c.get("auth");
  const workspace = await workspaceFor(
    c.env.DB,
    current.userId,
    current.workspaceId,
  );
  if (!workspace || !isEntitled(workspace)) {
    return errorResponse(c, "entitlement_required", 402);
  }
  await next();
});

app.use("*", requestContext);
app.use("*", cors);
app.use("/v1/auth/*", authRateLimit);
app.use("/v1/web-analytics/collect", collectorRateLimit);
app.use("/v1/web-analytics/crawler", collectorRateLimit);

app.get("/healthz", (c) =>
  c.json({
    status: "ok",
    service: "appclimb-api",
    version: c.env.APP_VERSION,
    runtime: "cloudflare-workers",
    now: nowISO(),
  }),
);

app.get("/readyz", async (c) => {
  const result = await c.env.DB.prepare("SELECT 1 AS ready").first<{
    ready: number;
  }>();
  if (result?.ready !== 1) {
    return errorResponse(c, "database_not_ready", 503);
  }
  return c.json({
    status: "ready",
    database: "d1",
    queue: "cloudflare-queues",
    externalMutations: asBoolean(c.env.EXTERNAL_MUTATIONS_ENABLED),
    historyRetentionDays: Number(c.env.HISTORY_RETENTION_DAYS),
    syncIntervalHours: Number(c.env.SYNC_INTERVAL_HOURS),
  });
});

app.post("/v1/auth/signup", async (c) => {
  const input = await jsonBody(c.req.raw);
  if (
    !validEmail(input.email) ||
    !validPassword(input.password) ||
    (typeof input.workspaceName !== "undefined" &&
      (typeof input.workspaceName !== "string" ||
        input.workspaceName.length > 120))
  ) {
    return errorResponse(c, "invalid_signup_payload", 400);
  }
  const passwordHash = await hashPassword(input.password);
  const identity = await createIdentity(
    c.env.DB,
    input.email,
    passwordHash,
    typeof input.workspaceName === "string" ? input.workspaceName : "",
  );
  if (!identity) {
    return errorResponse(c, "account_already_exists", 409);
  }
  const tokens = await issueTokens(c.env, identity);
  return c.json({ data: { identity, tokens } }, 201);
});

app.post("/v1/auth/login", async (c) => {
  const input = await jsonBody(c.req.raw);
  if (!validEmail(input.email) || !validPassword(input.password)) {
    return errorResponse(c, "invalid_credentials", 401);
  }
  const found = await findIdentityByEmail(c.env.DB, input.email);
  if (!found || !(await verifyPassword(found.passwordHash, input.password))) {
    return errorResponse(c, "invalid_credentials", 401);
  }
  const tokens = await issueTokens(c.env, found.identity);
  return c.json({ data: { identity: found.identity, tokens } });
});

app.post("/v1/auth/refresh", async (c) => {
  const input = await jsonBody(c.req.raw);
  if (
    typeof input.refreshToken !== "string" ||
    input.refreshToken.length < 48 ||
    input.refreshToken.length > 256
  ) {
    return errorResponse(c, "invalid_refresh_token", 401);
  }
  const nextRaw = randomToken(48);
  const nextExpiry = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const identity = await rotateRefreshSession(
    c.env.DB,
    await sha256(input.refreshToken),
    await sha256(nextRaw),
    nextExpiry,
  );
  if (!identity) {
    return errorResponse(c, "invalid_refresh_token", 401);
  }
  const jwt = await issueAccessToken(
    requireSecret(c.env, "JWT_SECRET"),
    identity.userId,
    identity.workspaceId,
    identity.role,
  );
  return c.json({
    data: {
      identity,
      tokens: {
        accessToken: jwt.token,
        refreshToken: nextRaw,
        accessTokenExpiresAt: jwt.expiresAt,
        refreshTokenExpiresAt: nextExpiry,
      },
    },
  });
});

app.post("/v1/auth/logout", async (c) => {
  const input = await jsonBody(c.req.raw);
  if (typeof input.refreshToken === "string" && input.refreshToken) {
    await revokeRefreshFamily(c.env.DB, await sha256(input.refreshToken));
  }
  return c.body(null, 204);
});

async function sendPasswordReset(
  env: Cloudflare.Env,
  email: string,
  rawToken: string,
): Promise<void> {
  const mailEnv = env as Cloudflare.Env & {
    EMAIL?: SendEmail;
    MAIL_FROM?: string;
  };
  if (!mailEnv.EMAIL || !mailEnv.MAIL_FROM) {
    log("warn", "password_reset_mail_unavailable", {
      errorCode: "mail_not_configured",
    });
    return;
  }
  const resetUrl = `${env.PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const mail = passwordResetEmail({
    resetUrl,
    appUrl: env.PUBLIC_APP_URL,
    expiresInMinutes: 30,
  });
  await mailEnv.EMAIL.send({
    from: {
      email: mailEnv.MAIL_FROM,
      name: "AppClimb",
    },
    to: email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

app.post("/v1/auth/password/forgot", async (c) => {
  const input = await jsonBody(c.req.raw);
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (email.length <= 320) {
    const user = await c.env.DB.prepare(
      "SELECT id,email FROM users WHERE email = ? COLLATE NOCASE",
    )
      .bind(email)
      .first<{ id: string; email: string }>();
    if (user) {
      const rawToken = randomToken(32);
      const tokenHash = await sha256(rawToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
      await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE password_reset_tokens
           SET used_at = COALESCE(used_at, ?)
           WHERE user_id = ? AND used_at IS NULL`,
        ).bind(now.toISOString(), user.id),
        c.env.DB.prepare(
          `INSERT INTO password_reset_tokens(
            id,user_id,token_hash,expires_at,created_at
           ) VALUES(?,?,?,?,?)`,
        ).bind(
          crypto.randomUUID(),
          user.id,
          tokenHash.buffer,
          expiresAt,
          now.toISOString(),
        ),
      ]);
      c.executionCtx.waitUntil(
        sendPasswordReset(c.env, user.email, rawToken).catch((error) =>
          log("error", "password_reset_mail_failed", {
            error: error instanceof Error ? error.message : "unknown",
          }),
        ),
      );
    }
  }
  return c.json({ accepted: true }, 202);
});

app.post("/v1/auth/password/reset", async (c) => {
  const input = await jsonBody(c.req.raw);
  if (
    typeof input.token !== "string" ||
    input.token.trim().length < 40 ||
    input.token.trim().length > 128 ||
    !validPassword(input.newPassword)
  ) {
    return errorResponse(c, "invalid_or_expired_reset", 400);
  }
  const token = await c.env.DB.prepare(
    `SELECT prt.id,prt.user_id,wm.workspace_id
     FROM password_reset_tokens prt
     JOIN workspace_members wm ON wm.user_id = prt.user_id
     WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > ?
     ORDER BY wm.created_at LIMIT 1`,
  )
    .bind((await sha256(input.token.trim())).buffer, nowISO())
    .first<{ id: string; user_id: string; workspace_id: string }>();
  if (!token) {
    return errorResponse(c, "invalid_or_expired_reset", 400);
  }
  const passwordHash = await hashPassword(input.newPassword);
  const now = nowISO();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE users SET password_hash = ?,updated_at = ? WHERE id = ?",
    ).bind(passwordHash, now, token.user_id),
    c.env.DB.prepare(
      `UPDATE password_reset_tokens SET used_at = ?
       WHERE user_id = ? AND used_at IS NULL`,
    ).bind(now, token.user_id),
    c.env.DB.prepare(
      `UPDATE refresh_sessions SET revoked_at = COALESCE(revoked_at, ?)
       WHERE user_id = ?`,
    ).bind(now, token.user_id),
    c.env.DB.prepare(
      `INSERT INTO audit_events(
        id,workspace_id,actor_user_id,action,target_type,target_id,metadata,occurred_at
       ) VALUES(?,?,?,'account.password_reset','user',?,'{}',?)`,
    ).bind(
      crypto.randomUUID(),
      token.workspace_id,
      token.user_id,
      token.user_id,
      now,
    ),
  ]);
  return c.body(null, 204);
});

app.get("/v1/me", requireAuth, async (c) => {
  const auth = c.get("auth");
  const identity = await findIdentity(c.env.DB, auth.userId, auth.workspaceId);
  if (!identity) {
    return errorResponse(c, "session_not_found", 401);
  }
  return c.json({ data: identity });
});

app.patch("/v1/me", requireAuth, async (c) => {
  const input = await jsonBody(c.req.raw);
  const avatar = typeof input.avatarKey === "string" ? input.avatarKey.trim() : "";
  const allowed = new Set([
    "ridge",
    "river",
    "summit",
    "forest",
    "dawn",
    "glacier",
    "night",
    "horizon",
  ]);
  if (!allowed.has(avatar)) {
    return errorResponse(c, "invalid_avatar", 400);
  }
  const auth = c.get("auth");
  await c.env.DB.prepare(
    `UPDATE users SET avatar_key = ?,updated_at = ?
     WHERE id = ? AND EXISTS(
       SELECT 1 FROM workspace_members
       WHERE user_id = ? AND workspace_id = ?
     )`,
  )
    .bind(avatar, nowISO(), auth.userId, auth.userId, auth.workspaceId)
    .run();
  const identity = await findIdentity(c.env.DB, auth.userId, auth.workspaceId);
  if (!identity) {
    return errorResponse(c, "session_not_found", 401);
  }
  return c.json({ data: identity });
});

app.post("/v1/account/password", requireAuth, authRateLimit, async (c) => {
  const input = await jsonBody(c.req.raw);
  if (
    !validPassword(input.currentPassword) ||
    !validPassword(input.newPassword) ||
    input.currentPassword === input.newPassword
  ) {
    return errorResponse(c, "invalid_password_change", 400);
  }
  const auth = c.get("auth");
  const row = await c.env.DB.prepare(
    `SELECT u.password_hash FROM users u
     JOIN workspace_members wm ON wm.user_id = u.id
     WHERE u.id = ? AND wm.workspace_id = ?`,
  )
    .bind(auth.userId, auth.workspaceId)
    .first<{ password_hash: string }>();
  if (!row) {
    return errorResponse(c, "session_not_found", 401);
  }
  if (!(await verifyPassword(row.password_hash, input.currentPassword))) {
    return errorResponse(c, "current_password_invalid", 401);
  }
  const nextHash = await hashPassword(input.newPassword);
  const now = nowISO();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE users SET password_hash = ?,updated_at = ? WHERE id = ?",
    ).bind(nextHash, now, auth.userId),
    c.env.DB.prepare(
      `UPDATE refresh_sessions SET revoked_at = COALESCE(revoked_at, ?)
       WHERE user_id = ?`,
    ).bind(now, auth.userId),
  ]);
  await audit(
    c.env.DB,
    auth.workspaceId,
    auth.userId,
    "account.password_changed",
    "user",
    auth.userId,
  );
  return c.body(null, 204);
});

app.get("/v1/workspace", requireAuth, async (c) => {
  const auth = c.get("auth");
  const workspace = await workspaceFor(c.env.DB, auth.userId, auth.workspaceId);
  if (!workspace) {
    return errorResponse(c, "workspace_not_found", 404);
  }
  return c.json({ data: workspace });
});

app.delete("/v1/account", requireAuth, async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "owner") {
    return errorResponse(c, "owner_required", 403);
  }
  await c.env.DB.prepare(
    `DELETE FROM users
     WHERE id = ? AND EXISTS(
       SELECT 1 FROM workspace_members
       WHERE user_id = ? AND workspace_id = ?
     )`,
  )
    .bind(auth.userId, auth.userId, auth.workspaceId)
    .run();
  return c.body(null, 204);
});

app.get("/v1/sources", requireAuth, async (c) =>
  c.json({
    data: await listSources(c.env.DB, c.get("auth").workspaceId),
    externalMutations: false,
  }),
);

app.get(
  "/v1/sources/posthog/events",
  requireAuth,
  requireEntitlement,
  async (c) =>
    c.json({
      data: await postHogEventOptions(c.env, c.get("auth")),
      externalMutations: false,
    }),
);

app.patch(
  "/v1/sources/posthog/events",
  requireAuth,
  requireEntitlement,
  async (c) => {
    const auth = c.get("auth");
    if (!["owner", "admin"].includes(auth.role)) {
      return errorResponse(c, "admin_required", 403);
    }
    const input = await jsonBody(c.req.raw);
    const activationEvent =
      typeof input.activationEvent === "string"
        ? input.activationEvent.trim()
        : "";
    const sessionEvent =
      typeof input.sessionEvent === "string" ? input.sessionEvent.trim() : "";
    const eventPattern = /^[^\u0000-\u001f\u007f]{1,200}$/u;
    if (
      !eventPattern.test(activationEvent) ||
      !eventPattern.test(sessionEvent)
    ) {
      return errorResponse(c, "invalid_posthog_event_name", 400);
    }
    return c.json({
      data: await updatePostHogEvents(
        c.env,
        auth,
        activationEvent,
        sessionEvent,
      ),
      externalMutations: false,
    });
  },
);

app.post("/v1/sources/:provider/verify", requireAuth, requireEntitlement, async (c) => {
  const provider = c.req.param("provider");
  if (!isSupportedProvider(provider)) {
    return errorResponse(c, "unsupported_provider", 404);
  }
  const input = await jsonBody(c.req.raw);
  if (
    !input.credentials ||
    typeof input.credentials !== "object" ||
    Array.isArray(input.credentials) ||
    Object.keys(input.credentials).length > 20
  ) {
    return errorResponse(c, "invalid_credentials_payload", 400);
  }
  const verification = await verifyProvider(
    provider,
    input.credentials as Record<string, unknown>,
  );
  return c.json({ data: verification });
});

app.put("/v1/sources/:provider", requireAuth, requireEntitlement, async (c) => {
  const auth = c.get("auth");
  if (!["owner", "admin"].includes(auth.role)) {
    return errorResponse(c, "admin_required", 403);
  }
  const provider = c.req.param("provider");
  if (!isSupportedProvider(provider)) {
    return errorResponse(c, "unsupported_provider", 404);
  }
  const input = await jsonBody(c.req.raw);
  if (
    !input.credentials ||
    typeof input.credentials !== "object" ||
    Array.isArray(input.credentials) ||
    Object.keys(input.credentials).length > 20
  ) {
    return errorResponse(c, "invalid_credentials_payload", 400);
  }
  const source = await connectSource(
    c.env,
    auth,
    provider,
    input.credentials as Record<string, unknown>,
  );
  return c.json({ data: source, externalMutations: false }, 201);
});

app.delete("/v1/sources/:provider", requireAuth, async (c) => {
  const auth = c.get("auth");
  if (!["owner", "admin"].includes(auth.role)) {
    return errorResponse(c, "admin_required", 403);
  }
  const provider = c.req.param("provider");
  if (!isSupportedProvider(provider)) {
    return errorResponse(c, "unsupported_provider", 404);
  }
  await deleteSource(c.env, auth, provider);
  return c.body(null, 204);
});

app.post("/v1/sources/:provider/sync", requireAuth, requireEntitlement, async (c) => {
  const provider = c.req.param("provider");
  try {
    const data = await queueSourceSync(c.env, c.get("auth"), provider);
    return c.json({ data }, 202);
  } catch (error) {
    const code = error instanceof Error ? error.message : "sync_queue_failed";
    if (code === "unsupported_provider") return errorResponse(c, code, 404);
    if (code === "source_not_connected") return errorResponse(c, code, 404);
    if (code === "entitlement_required") return errorResponse(c, code, 402);
    throw error;
  }
});

app.get("/v1/apps", requireAuth, async (c) =>
  c.json({
    data: await listWorkspaceApps(c.env.DB, c.get("auth").workspaceId),
  }),
);

app.get("/v1/apps/search", requireAuth, async (c) => {
  // Apple blocks Cloudflare Workers IPs (403/429) from itunes.apple.com, so
  // catalog search now runs in the browser. Kept as an explicit 410 so the
  // contract stays honest instead of returning a misleading empty list.
  return errorResponse(c, "app_catalog_search_is_client_side", 410);
});

app.post("/v1/apps", requireAuth, async (c) => {
  const auth = c.get("auth");
  if (!["owner", "admin"].includes(auth.role)) {
    return errorResponse(c, "admin_required", 403);
  }
  const input = await jsonBody(c.req.raw);

  if (input.platform === "web") {
    // Growth CI is iOS-only. Web SaaS app creation is retired unless legacy
    // surfaces are explicitly re-enabled for migration access.
    if (isGrowthCiEnabled(c.env) && !areLegacySurfacesEnabled(c.env)) {
      return errorResponse(c, "ios_only_growth_ci", 400);
    }
    try {
      const metadata = sanitizeWebAppMetadata(
        input.metadata && typeof input.metadata === "object"
          ? (input.metadata as Record<string, unknown>)
          : (input as Record<string, unknown>),
      );
      return c.json(
        {
          data: await addWebApp(c.env, auth, metadata),
        },
        201,
      );
    } catch (error) {
      if (error instanceof ProviderError) {
        const status =
          error.status === 400 || error.status === 403 || error.status === 409
            ? error.status
            : 400;
        return errorResponse(c, error.message, status);
      }
      const code = error instanceof Error ? error.message : "web_add_failed";
      if (code === "invalid_web_property" || code === "invalid_domain") {
        return errorResponse(c, code, 400);
      }
      throw error;
    }
  }

  if (input.platform !== "app-store") {
    return errorResponse(
      c,
      input.platform === "google-play"
        ? "google_play_not_supported"
        : "unsupported_app_catalog",
      input.platform === "google-play" ? 400 : 400,
    );
  }
  // Catalog metadata comes from the browser's iTunes lookup. The server
  // validates appStoreId (numeric) and bounds every field; it no longer
  // re-verifies the listing exists, because Apple blocks server-side lookups.
  const metadata = sanitizeClientAppMetadata(
    input.metadata && typeof input.metadata === "object"
      ? (input.metadata as Record<string, unknown>)
      : (input as Record<string, unknown>),
  );
  return c.json(
    {
      data: await addAppStoreApp(
        c.env,
        auth,
        metadata,
        typeof input.storefront === "string" ? input.storefront : "US",
      ),
    },
    201,
  );
});

app.patch("/v1/apps", requireAuth, async (c) => {
  const auth = c.get("auth");
  if (!["owner", "admin"].includes(auth.role)) {
    return errorResponse(c, "admin_required", 403);
  }
  const input = await jsonBody(c.req.raw);
  const name = typeof input.name === "string" ? input.name : "";
  const storefront = typeof input.storefront === "string" ? input.storefront : undefined;
  const data = await updateWorkspaceApp(c.env, auth, name, storefront);
  return c.json({ data });
});

app.delete("/v1/apps/:id", requireAuth, async (c) => {
  const auth = c.get("auth");
  if (!["owner", "admin"].includes(auth.role)) {
    return errorResponse(c, "admin_required", 403);
  }
  const appId = c.req.param("id");
  const data = await deleteWorkspaceApp(c.env, auth, appId);
  return c.json({ data });
});

// ---------------------------------------------------------------------------
// Growth CI workspace + Agent Bridge (user JWT + agent tokens)
// ---------------------------------------------------------------------------

app.get("/v1/growth-ci", requireAuth, async (c) => {
  if (!isGrowthCiEnabled(c.env)) {
    return errorResponse(c, "growth_ci_disabled", 404);
  }
  const auth = c.get("auth");
  const appId = (c.req.query("appId") ?? "").trim();
  if (!appId) return errorResponse(c, "app_id_required", 400);
  const data = await growthCiWorkspaceSnapshot(c.env.DB, auth.workspaceId, appId);
  if (!data) return errorResponse(c, "app_not_found", 404);
  return c.json({ data, flags: readGrowthCiFlags(c.env) });
});

app.get("/v1/growth-ci/contract", requireAuth, async (c) => {
  if (!isGrowthCiEnabled(c.env)) {
    return errorResponse(c, "growth_ci_disabled", 404);
  }
  const auth = c.get("auth");
  const appId = (c.req.query("appId") ?? "").trim();
  if (!appId) return errorResponse(c, "app_id_required", 400);
  const row = await ensureGrowthContract(c.env.DB, auth.workspaceId, appId);
  return c.json({ data: row });
});

app.get("/v1/growth-ci/version-candidates", requireAuth, async (c) => {
  if (!isGrowthCiEnabled(c.env)) {
    return errorResponse(c, "growth_ci_disabled", 404);
  }
  const auth = c.get("auth");
  const appId = (c.req.query("appId") ?? "").trim();
  if (!appId) return errorResponse(c, "app_id_required", 400);
  try {
    const data = await discoverVersionCandidatesForApp(
      c.env,
      auth.workspaceId,
      appId,
    );
    return c.json({ data });
  } catch (error) {
    if (error instanceof ProviderError) {
      return errorResponse(c, error.message, error.status as 400);
    }
    throw error;
  }
});

app.post("/v1/growth-ci/mapping/version", requireAuth, async (c) => {
  if (!isGrowthCiEnabled(c.env)) {
    return errorResponse(c, "growth_ci_disabled", 404);
  }
  const auth = c.get("auth");
  if (!["owner", "admin"].includes(auth.role)) {
    return errorResponse(c, "admin_required", 403);
  }
  const input = await jsonBody(c.req.raw);
  const appId = typeof input.appId === "string" ? input.appId.trim() : "";
  const versionProperty =
    typeof input.versionProperty === "string" ? input.versionProperty.trim() : "";
  const buildProperty =
    typeof input.buildProperty === "string" ? input.buildProperty.trim() : "";
  const confirm = input.confirm === true;
  if (!appId || !versionProperty) {
    return errorResponse(c, "invalid_version_mapping", 400);
  }
  if (!/^\$?[A-Za-z_][A-Za-z0-9_]*$/u.test(versionProperty)) {
    return errorResponse(c, "invalid_property_key", 400);
  }
  if (buildProperty && !/^\$?[A-Za-z_][A-Za-z0-9_]*$/u.test(buildProperty)) {
    return errorResponse(c, "invalid_property_key", 400);
  }
  const confirmedAt = confirm ? nowISO() : null;
  await updateContractMeasurement(c.env.DB, auth.workspaceId, appId, {
    versionProperty,
    buildProperty,
    versionPropertyStatus: confirm ? "confirmed" : "unconfirmed",
    versionPropertyConfirmedAt: confirmedAt,
  });
  // Best-effort mirror onto posthog_mappings when present
  try {
    await c.env.DB.prepare(
      `UPDATE posthog_mappings SET
        version_property=?,
        build_property=?,
        version_property_status=?,
        version_property_confirmed_at=?,
        updated_at=?
       WHERE workspace_id=? AND (app_id=? OR app_id IS NULL)`,
    )
      .bind(
        versionProperty,
        buildProperty,
        confirm ? "confirmed" : "unconfirmed",
        confirmedAt,
        nowISO(),
        auth.workspaceId,
        appId,
      )
      .run();
  } catch {
    // mapping table columns may lag in older local DBs mid-migration
  }
  // Also seal into PostHog credentials when connected
  try {
    const connection = await c.env.DB.prepare(
      `SELECT id,credential_envelope FROM source_connections
       WHERE workspace_id=? AND app_id=? AND provider='posthog' LIMIT 1`,
    )
      .bind(auth.workspaceId, appId)
      .first<{ id: string; credential_envelope: string }>();
    if (connection) {
      const { openCredentials, sealCredentials } = await import("./crypto");
      const envelope = JSON.parse(connection.credential_envelope);
      const credentials = await openCredentials(
        envelope,
        requireSecret(c.env, "ENVELOPE_MASTER_KEY"),
      );
      const next = {
        ...credentials,
        versionProperty,
        buildProperty,
        versionPropertyStatus: confirm ? "confirmed" : "unconfirmed",
        versionPropertyConfirmed: confirm,
      };
      const resealed = await sealCredentials(
        next,
        requireSecret(c.env, "ENVELOPE_MASTER_KEY"),
      );
      await c.env.DB.prepare(
        `UPDATE source_connections SET credential_envelope=?,updated_at=?
         WHERE id=? AND workspace_id=?`,
      )
        .bind(JSON.stringify(resealed), nowISO(), connection.id, auth.workspaceId)
        .run();
    }
  } catch {
    // non-fatal
  }
  if (confirm) {
    try {
      const { recordProductEvents } = await import("./product-events");
      await recordProductEvents(c.env.DB, auth, {
        events: [
          {
            name: "measurement_contract_confirmed",
            occurredAt: nowISO(),
            properties: { appId, versionProperty },
          },
        ],
      });
    } catch {
      // non-fatal analytics
    }
  }
  return c.json({
    data: {
      versionProperty,
      buildProperty,
      status: confirm ? "confirmed" : "unconfirmed",
    },
  });
});

app.post("/v1/growth-ci/incidents/:id/dismiss", requireAuth, async (c) => {
  if (!isGrowthCiEnabled(c.env)) {
    return errorResponse(c, "growth_ci_disabled", 404);
  }
  const auth = c.get("auth");
  if (!["owner", "admin"].includes(auth.role)) {
    return errorResponse(c, "admin_required", 403);
  }
  const input = await jsonBody(c.req.raw);
  const appId = typeof input.appId === "string" ? input.appId.trim() : "";
  const reason =
    typeof input.reason === "string" ? input.reason.trim() : "dismissed_by_user";
  if (!appId) return errorResponse(c, "app_id_required", 400);
  const ok = await dismissGrowthIncident(
    c.env.DB,
    auth.workspaceId,
    appId,
    c.req.param("id"),
    reason,
  );
  if (!ok) return errorResponse(c, "incident_not_open", 409);
  return c.json({ data: { dismissed: true } });
});

app.post("/v1/agent-tokens", requireAuth, async (c) => {
  if (!isAgentBridgeEnabled(c.env)) {
    return errorResponse(c, "agent_bridge_disabled", 404);
  }
  const auth = c.get("auth");
  if (!["owner", "admin"].includes(auth.role)) {
    return errorResponse(c, "admin_required", 403);
  }
  const input = await jsonBody(c.req.raw);
  const appId = typeof input.appId === "string" ? input.appId.trim() : "";
  const name = typeof input.name === "string" ? input.name : "Agent token";
  if (!appId) return errorResponse(c, "app_id_required", 400);
  const contract = await ensureGrowthContract(
    c.env.DB,
    auth.workspaceId,
    appId,
  );
  const workspaceRow = await c.env.DB.prepare(
    `SELECT subscription_status, trial_ends_at, entitlement_ends_at
     FROM workspaces WHERE id=? LIMIT 1`,
  )
    .bind(auth.workspaceId)
    .first<{
      subscription_status: string;
      trial_ends_at: string;
      entitlement_ends_at: string | null;
    }>();
  const access = assessGrowthCiAccess(
    {
      subscriptionStatus: workspaceRow?.subscription_status ?? "none",
      trialEndsAt: workspaceRow?.trial_ends_at ?? "1970-01-01T00:00:00.000Z",
      entitlementEndsAt: workspaceRow?.entitlement_ends_at ?? undefined,
    },
    contract.free_verdict_consumed_at,
  );
  if (!access.canUseAgentBridge) {
    return errorResponse(c, "agent_bridge_requires_pro", 402);
  }
  const created = await createAgentToken(c.env.DB, {
    workspaceId: auth.workspaceId,
    appId,
    name,
    createdByUserId: auth.userId,
  });
  // Raw token returned once only
  return c.json({ data: created }, 201);
});

app.get("/v1/agent-tokens", requireAuth, async (c) => {
  if (!isAgentBridgeEnabled(c.env)) {
    return errorResponse(c, "agent_bridge_disabled", 404);
  }
  const auth = c.get("auth");
  const appId = (c.req.query("appId") ?? "").trim() || undefined;
  return c.json({
    data: await listAgentTokens(c.env.DB, auth.workspaceId, appId),
  });
});

app.delete("/v1/agent-tokens/:id", requireAuth, async (c) => {
  if (!isAgentBridgeEnabled(c.env)) {
    return errorResponse(c, "agent_bridge_disabled", 404);
  }
  const auth = c.get("auth");
  if (!["owner", "admin"].includes(auth.role)) {
    return errorResponse(c, "admin_required", 403);
  }
  const ok = await revokeAgentToken(
    c.env.DB,
    auth.workspaceId,
    c.req.param("id"),
    auth.userId,
  );
  if (!ok) return errorResponse(c, "not_found", 404);
  return c.json({ data: { revoked: true } });
});

async function requireAgentAuth(
  c: {
    env: Cloudflare.Env;
    req: { header: (name: string) => string | undefined };
  },
): Promise<
  | { auth: NonNullable<Awaited<ReturnType<typeof authenticateAgentToken>>> }
  | Response
> {
  if (!isAgentBridgeEnabled(c.env)) {
    return errorResponse(
      c as Parameters<Parameters<typeof app.onError>[0]>[1],
      "agent_bridge_disabled",
      404,
    );
  }
  const auth = await authenticateAgentToken(
    c.env.DB,
    c.req.header("authorization"),
  );
  if (!auth) {
    return errorResponse(
      c as Parameters<Parameters<typeof app.onError>[0]>[1],
      "unauthorized",
      401,
    );
  }
  return { auth };
}

app.get("/v1/agent/status", async (c) => {
  const result = await requireAgentAuth(c);
  if (result instanceof Response) return result;
  if (!agentHasScope(result.auth, "verdicts:read") && !agentHasScope(result.auth, "tasks:read")) {
    return errorResponse(c, "forbidden", 403);
  }
  const data = await getAgentStatus(c.env.DB, result.auth);
  if (!data) return errorResponse(c, "app_not_found", 404);
  return c.json({ data });
});

app.get("/v1/agent/tasks/next", async (c) => {
  const result = await requireAgentAuth(c);
  if (result instanceof Response) return result;
  if (!agentHasScope(result.auth, "tasks:read")) {
    return errorResponse(c, "forbidden", 403);
  }
  const task = await getNextAgentTask(c.env.DB, result.auth);
  if (!task) return c.body(null, 204);
  return c.json({ data: task });
});

app.post("/v1/agent/tasks/:id/claim", async (c) => {
  const result = await requireAgentAuth(c);
  if (result instanceof Response) return result;
  if (!agentHasScope(result.auth, "tasks:write")) {
    return errorResponse(c, "forbidden", 403);
  }
  const input = await jsonBody(c.req.raw, 8 * 1024);
  const claimed = await claimAgentTask(
    c.env.DB,
    result.auth,
    c.req.param("id"),
    input as { agent?: string; agent_version?: string; workspace_hint?: string },
  );
  if (!claimed.ok) return errorResponse(c, claimed.code, 409);
  return c.json({
    data: {
      task_id: claimed.task.id,
      status: claimed.task.status,
      claim_expires_at: claimed.task.claim_expires_at,
      packet: JSON.parse(claimed.task.task_packet),
    },
  });
});

app.post("/v1/agent/tasks/:id/events", async (c) => {
  const result = await requireAgentAuth(c);
  if (result instanceof Response) return result;
  if (!agentHasScope(result.auth, "tasks:write")) {
    return errorResponse(c, "forbidden", 403);
  }
  const idempotencyKey = c.req.header("x-idempotency-key") ?? "";
  const input = await jsonBody(c.req.raw, 16 * 1024);
  const reported = await reportAgentTaskEvent(
    c.env,
    result.auth,
    c.req.param("id"),
    idempotencyKey,
    input as {
      event_type?: string;
      payload?: unknown;
      occurred_at?: string;
    },
  );
  if (!reported.ok) return errorResponse(c, reported.code, reported.status as 400);
  return c.json({ data: { accepted: true } });
});

app.post("/v1/agent/releases", async (c) => {
  const result = await requireAgentAuth(c);
  if (result instanceof Response) return result;
  if (!agentHasScope(result.auth, "releases:write")) {
    return errorResponse(c, "forbidden", 403);
  }
  const input = await jsonBody(c.req.raw, 8 * 1024);
  const reported = await reportAgentRelease(
    c.env,
    result.auth,
    input as {
      version?: string;
      build_number?: string;
      reported_deployed_at?: string;
      commit_sha?: string;
      previous_commit_sha?: string;
      pull_request_url?: string;
      task_id?: string;
    },
  );
  if (!reported.ok) return errorResponse(c, reported.code, reported.status as 400);
  return c.json({ data: { release_id: reported.releaseId } }, 201);
});

app.get("/v1/agent/tasks/:id/verification", async (c) => {
  const result = await requireAgentAuth(c);
  if (result instanceof Response) return result;
  if (!agentHasScope(result.auth, "verdicts:read") && !agentHasScope(result.auth, "tasks:read")) {
    return errorResponse(c, "forbidden", 403);
  }
  const data = await getTaskVerification(
    c.env.DB,
    result.auth,
    c.req.param("id"),
  );
  if (!data) return errorResponse(c, "not_found", 404);
  return c.json({ data });
});

app.get("/v1/ai-visibility", requireAuth, async (c) => {
  if (isGrowthCiEnabled(c.env) && !areLegacySurfacesEnabled(c.env)) {
    return errorResponse(c, "legacy_surface_retired", 410);
  }
  const appId = (c.req.query("appId") ?? "").trim();
  return c.json({
    data: await aiVisibilitySnapshot(c.env, c.get("auth"), appId),
  });
});

app.post(
  "/v1/ai-visibility/setup",
  requireAuth,
  aiVisibilityRateLimit,
  async (c) => {
    const input = await jsonBody(c.req.raw);
    const appId = typeof input.appId === "string" ? input.appId.trim() : "";
    return c.json(
      { data: await setupAiVisibility(c.env, c.get("auth"), appId) },
      201,
    );
  },
);

app.post(
  "/v1/ai-visibility/prompts",
  requireAuth,
  aiVisibilityRateLimit,
  async (c) => {
    const input = await jsonBody(c.req.raw);
    return c.json(
      {
        data: await addAiVisibilityPrompt(
          c.env,
          c.get("auth"),
          typeof input.appId === "string" ? input.appId.trim() : "",
          typeof input.category === "string" ? input.category.trim() : "",
          typeof input.prompt === "string" ? input.prompt : "",
        ),
      },
      201,
    );
  },
);

app.delete(
  "/v1/ai-visibility/prompts/:promptId",
  requireAuth,
  aiVisibilityRateLimit,
  async (c) => {
    await removeAiVisibilityPrompt(
      c.env,
      c.get("auth"),
      c.req.param("promptId"),
    );
    return c.body(null, 204);
  },
);

app.patch(
  "/v1/ai-visibility/settings",
  requireAuth,
  aiVisibilityRateLimit,
  async (c) => {
    const input = await jsonBody(c.req.raw);
    return c.json({
      data: await updateAiVisibilityCadence(
        c.env,
        c.get("auth"),
        typeof input.appId === "string" ? input.appId.trim() : "",
        typeof input.cadence === "string" ? input.cadence.trim() : "",
      ),
    });
  },
);

app.post(
  "/v1/ai-visibility/scans",
  requireAuth,
  aiVisibilityRateLimit,
  async (c) => {
    const input = await jsonBody(c.req.raw);
    return c.json(
      {
        data: await queueAiVisibilityScan(
          c.env,
          c.get("auth"),
          typeof input.appId === "string" ? input.appId.trim() : "",
        ),
      },
      202,
    );
  },
);

app.get("/v1/keywords", requireAuth, requireEntitlement, async (c) => {
  const appId = (c.req.query("appId") ?? "").trim();
  return c.json({
    data: await listKeywordTracks(
      c.env.DB,
      c.get("auth").workspaceId,
      appId,
    ),
    meta: {
      rankSource: "Apple Search API observed result position",
      popularitySource: "Apple Ads connection required",
    },
  });
});

app.get(
  "/v1/keywords/suggestions",
  requireAuth,
  requireEntitlement,
  // Suggestions are now derived in the browser from the iTunes /lookup
  // payload the client already fetched. Honest 410 instead of a misleading
  // empty list.
  (c) => errorResponse(c, "keyword_suggestions_are_client_side", 410),
);

app.post("/v1/keywords", requireAuth, requireEntitlement, async (c) => {
  const input = await jsonBody(c.req.raw);
  const auth = c.get("auth");
  const appId = typeof input.appId === "string" ? input.appId.trim() : "";
  const data = await addKeywordTrack(
    c.env,
    auth,
    appId,
    typeof input.keyword === "string" ? input.keyword : "",
    typeof input.storefront === "string" ? input.storefront : "US",
  );
  // Rank observation is now performed by the client (POST /v1/keywords/
  // observations) immediately after adding a track; the server no longer
  // performs the iTunes call that Apple blocks from Workers.
  return c.json({ data }, 201);
});

app.post(
  "/v1/keywords/check",
  requireAuth,
  requireEntitlement,
  // Server-side rank checking is retired: Apple blocks Workers IPs, and no
  // free non-Cloudflare egress exists. The client performs the check and
  // POSTs observations to /v1/keywords/observations. Kept as 410 for honesty.
  (c) => errorResponse(c, "keyword_check_is_client_side", 410),
);

app.post(
  "/v1/keywords/observations",
  requireAuth,
  requireEntitlement,
  async (c) => {
    const input = await jsonBody(c.req.raw);
    const auth = c.get("auth");
    const appId = typeof input.appId === "string" ? input.appId.trim() : "";
    const observations = Array.isArray(input.observations)
      ? (input.observations as {
          keyword?: unknown;
          storefront?: unknown;
          rank?: unknown;
        }[])
      : [];
    const data = await recordKeywordObservations(
      c.env,
      auth,
      appId,
      observations.map((observation) => ({
        keyword: typeof observation.keyword === "string" ? observation.keyword : "",
        storefront:
          typeof observation.storefront === "string"
            ? observation.storefront
            : "US",
        rank:
          typeof observation.rank === "number" || observation.rank === null
            ? observation.rank
            : null,
      })),
    );
    return c.json({ data }, 201);
  },
);

app.get("/v1/growth-map", requireAuth, async (c) => {
  const snapshot = await growthMapSnapshot(
    c.env,
    c.get("auth"),
    (c.req.query("appId") ?? "").trim(),
  );
  return c.json(snapshot);
});

/**
 * Persistent Lab experiments (plan task P0.29). Before these routes the Lab
 * held drafts in React state only, so "create draft" was lost on reload.
 */
const EXPERIMENT_ERRORS: Record<string, ContentfulStatusCode> = {
  app_not_found: 404,
  experiment_not_found: 404,
  action_proposal_not_found: 404,
  experiment_limit_reached: 409,
  invalid_experiment: 400,
  invalid_experiment_stage: 400,
  invalid_experiment_source: 400,
  invalid_experiment_status: 400,
  invalid_feedback_action: 400,
  feedback_reason_required: 400,
};

function experimentError(
  c: Parameters<Parameters<typeof app.onError>[0]>[1],
  error: unknown,
) {
  const code = error instanceof Error ? error.message : "experiment_failed";
  const status = EXPERIMENT_ERRORS[code];
  if (!status) throw error;
  return errorResponse(c, code, status);
}

app.get("/v1/experiments", requireAuth, async (c) => {
  try {
    const data = await listExperiments(
      c.env.DB,
      c.get("auth"),
      (c.req.query("appId") ?? c.req.query("app") ?? "").trim(),
    );
    return c.json({ data, meta: { externalMutationsAllowed: false } });
  } catch (error) {
    return experimentError(c, error);
  }
});

app.post("/v1/experiments", requireAuth, requireEntitlement, async (c) => {
  const input = await jsonBody(c.req.raw);
  try {
    const data = await createExperiment(
      c.env.DB,
      c.get("auth"),
      typeof input.appId === "string" ? input.appId.trim() : "",
      input,
    );
    return c.json({ data, meta: { externalMutationsAllowed: false } }, 201);
  } catch (error) {
    return experimentError(c, error);
  }
});

app.patch("/v1/experiments/:id", requireAuth, requireEntitlement, async (c) => {
  const input = await jsonBody(c.req.raw);
  try {
    const data = await updateExperiment(
      c.env.DB,
      c.get("auth"),
      c.req.param("id"),
      input,
    );
    return c.json({ data, meta: { externalMutationsAllowed: false } });
  } catch (error) {
    return experimentError(c, error);
  }
});

app.delete("/v1/experiments/:id", requireAuth, requireEntitlement, async (c) => {
  try {
    await deleteExperiment(c.env.DB, c.get("auth"), c.req.param("id"));
    return c.body(null, 204);
  } catch (error) {
    return experimentError(c, error);
  }
});

/**
 * Insight feedback (plan task P0.30). Accept, dismiss, not relevant, mapping is
 * wrong and converted-to-experiment all land here; each one stores a reason and
 * writes an audit event so the accepted / dismissed / diagnosis-to-experiment
 * rates are measurable.
 */
app.post(
  "/v1/action-proposals/:id/feedback",
  requireAuth,
  requireEntitlement,
  async (c) => {
    const input = await jsonBody(c.req.raw);
    try {
      const data = await recordProposalFeedback(
        c.env.DB,
        c.get("auth"),
        c.req.param("id"),
        input,
      );
      return c.json({ data, meta: { externalMutationsAllowed: false } }, 201);
    } catch (error) {
      return experimentError(c, error);
    }
  },
);

/** AppClimb's own client-side product analytics (plan section 14). */
app.post("/v1/product-events", requireAuth, async (c) => {
  const input = await jsonBody(c.req.raw, 16 * 1024);
  const data = await recordProductEvents(c.env.DB, c.get("auth"), input);
  return c.json({ data }, 202);
});

app.get("/v1/web-analytics", requireAuth, requireEntitlement, async (c) => {
  const days = Number(c.req.query("days") ?? "7");
  if (![7, 30, 90].includes(days)) {
    return errorResponse(c, "invalid_analytics_window", 400);
  }
  const appId = (c.req.query("appId") ?? c.req.query("app") ?? "").trim();
  const snapshot = await webAnalyticsSnapshot(
    c.env,
    c.get("auth").workspaceId,
    days,
    appId,
  );
  const hasData =
    Number((snapshot.totals as { pageviews?: number }).pageviews ?? 0) > 0 ||
    Number(
      (snapshot.crawlers as { requests?: number }).requests ?? 0,
    ) > 0;
  return c.json({
    data: snapshot,
    meta: {
      mode: hasData ? "live" : "empty",
      windowDays: days,
      externalMutationsAllowed: false,
      privacy: { storesIPAddress: false, defaultStorage: "session" },
    },
  });
});

app.post("/v1/web-analytics/property", requireAuth, requireEntitlement, async (c) => {
  const auth = c.get("auth");
  if (!["owner", "admin"].includes(auth.role)) {
    return errorResponse(c, "admin_required", 403);
  }
  const input = await jsonBody(c.req.raw);
  try {
    const property = await createProperty(
      c.env,
      auth,
      input.name,
      input.domain,
      input.appId,
    );
    return c.json(
      {
        data: property,
        meta: { storesIPAddress: false, defaultStorage: "session" },
      },
      201,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "web_property_failed";
    if (code === "invalid_web_property") return errorResponse(c, code, 400);
    if (code === "web_property_exists") return errorResponse(c, code, 409);
    throw error;
  }
});

app.get("/v1/web-analytics/install", requireAuth, async (c) => {
  const appId = (c.req.query("appId") ?? c.req.query("app") ?? "").trim();
  const snapshot = await webInstallSnapshot(
    c.env,
    c.get("auth").workspaceId,
    appId,
  );
  return c.json({ data: snapshot });
});

app.post("/v1/web-analytics/install/step", requireAuth, async (c) => {
  const auth = c.get("auth");
  if (!["owner", "admin"].includes(auth.role)) {
    return errorResponse(c, "admin_required", 403);
  }
  const input = await jsonBody(c.req.raw, 2 * 1024);
  try {
    const result = await saveInstallStep(
      c.env,
      auth,
      input.step,
      typeof input.appId === "string" ? input.appId : "",
    );
    return c.json({ data: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "install_step_failed";
    if (code === "invalid_install_step") return errorResponse(c, code, 400);
    if (code === "web_property_missing") return errorResponse(c, code, 404);
    throw error;
  }
});

app.post("/v1/web-analytics/conversion-goal", requireAuth, async (c) => {
  const auth = c.get("auth");
  if (!["owner", "admin"].includes(auth.role)) {
    return errorResponse(c, "admin_required", 403);
  }
  const input = await jsonBody(c.req.raw, 2 * 1024);
  try {
    const result = await saveConversionGoal(
      c.env,
      auth,
      input.goal,
      typeof input.appId === "string" ? input.appId : "",
    );
    return c.json({ data: result });
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "conversion_goal_failed";
    if (code === "invalid_conversion_goal") return errorResponse(c, code, 400);
    if (code === "web_property_missing") return errorResponse(c, code, 404);
    throw error;
  }
});

app.post("/v1/web-analytics/collect", async (c) => {
  const input = await jsonBody(c.req.raw, 16 * 1024);
  try {
    await recordWebEvent(c.env, c.req.raw, input);
    return c.body(null, 202);
  } catch (error) {
    const code = error instanceof Error ? error.message : "collection_failed";
    if (code === "invalid_tracking_token") return errorResponse(c, code, 401);
    if (code === "invalid_analytics_event") return errorResponse(c, code, 400);
    throw error;
  }
});

app.post("/v1/web-analytics/crawler", async (c) => {
  const input = await jsonBody(c.req.raw, 16 * 1024);
  try {
    const result = await recordCrawlerEvent(c.env, c.req.raw, input);
    return c.body(null, result === "ignored" ? 204 : 202);
  } catch (error) {
    const code = error instanceof Error ? error.message : "collection_failed";
    if (code === "invalid_tracking_token") return errorResponse(c, code, 401);
    if (code === "invalid_crawler_event") return errorResponse(c, code, 400);
    throw error;
  }
});

app.post("/v1/internal/sync/run", async (c) => {
  const provided = (c.req.header("authorization") ?? "").replace(/^Bearer /u, "");
  const expected = requireSecret(c.env, "INTERNAL_SYNC_TOKEN");
  if (!provided || !(await constantTimeStrings(provided, expected))) {
    return errorResponse(c, "unauthorized", 401);
  }
  const queued = await queueDueSyncs(c.env);
  return c.json({ accepted: true, queued }, 202);
});

app.post("/v1/billing/checkout-binding", requireAuth, authRateLimit, async (c) => {
  if (!billingConfigured(c.env)) {
    return errorResponse(c, "billing_not_configured", 503);
  }
  const auth = c.get("auth");
  if (!["owner", "admin"].includes(auth.role)) {
    return errorResponse(c, "admin_required", 403);
  }
  const input = await jsonBody(c.req.raw);
  const priceId = typeof input.priceId === "string" ? input.priceId.trim() : "";
  try {
    const binding = await createCheckoutBinding(
      c.env,
      auth.workspaceId,
      priceId,
    );
    return c.json({ data: binding }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "checkout_binding_failed";
    if (code === "billing_price_not_allowed") {
      return errorResponse(c, code, 400);
    }
    if (
      code === "billing_subscription_exists" ||
      code === "checkout_already_pending"
    ) {
      return errorResponse(c, code, 409);
    }
    if (code === "workspace_not_found") {
      return errorResponse(c, code, 404);
    }
    throw error;
  }
});

app.post("/v1/billing/webhook", async (c) => {
  if (!billingConfigured(c.env)) {
    return errorResponse(c, "billing_not_configured", 503);
  }
  const body = await c.req.text();
  if (
    !body ||
    new TextEncoder().encode(body).length > 64 * 1024
  ) {
    return errorResponse(c, "invalid_webhook_body", 400);
  }
  const validSignature = await verifyPaddleSignature(
    body,
    c.req.header("paddle-signature") ?? "",
    requireSecret(c.env, "PADDLE_WEBHOOK_SECRET"),
  );
  if (!validSignature) {
    return errorResponse(c, "invalid_webhook_signature", 401);
  }
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return errorResponse(c, "malformed_webhook_event", 400);
  }
  const eventId =
    typeof event.event_id === "string" ? event.event_id.trim() : "";
  const eventType =
    typeof event.event_type === "string" ? event.event_type.trim() : "";
  const occurred =
    typeof event.occurred_at === "string" ? event.occurred_at.trim() : "";
  const occurredAt = new Date(occurred);
  if (
    !eventId ||
    !eventType ||
    !occurred ||
    !Number.isFinite(occurredAt.getTime())
  ) {
    return errorResponse(c, "malformed_webhook_event", 400);
  }
  let update = null;
  let ignoredReason = "";
  if (eventType.startsWith("subscription.")) {
    try {
      const parsed = parseSubscriptionUpdate(
        event.data,
        requireSecret(c.env, "PADDLE_PRODUCT_ID"),
        requireSecret(c.env, "PADDLE_PRODUCT_IDENTITY"),
        new Set(
          requireSecret(c.env, "PADDLE_ALLOWED_PRICE_IDS")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      );
      update = parsed.update;
      ignoredReason = parsed.ignoredReason;
    } catch {
      return errorResponse(c, "malformed_webhook_event", 400);
    }
  }
  const result = await recordBillingEvent(
    c.env,
    eventId,
    eventType,
    occurredAt.toISOString(),
    redactCheckoutBinding(event),
    update,
  );
  if (
    !ignoredReason &&
    result.reason !== "applied" &&
    result.reason !== "duplicate"
  ) {
    ignoredReason = result.reason;
  }
  return c.json({
    received: true,
    duplicate: !result.inserted,
    applied: result.applied,
    reconciliationRequired: result.reconciliationRequired,
    ignored: ignoredReason,
  });
});

app.notFound((c) => errorResponse(c, "not_found", 404));

app.onError((error, c) => {
  if (error instanceof ProviderError) {
    const status = (
      [400, 401, 402, 403, 404, 409, 429].includes(error.status)
        ? error.status
        : error.status >= 500
          ? 502
          : 400
    ) as ContentfulStatusCode;
    return errorResponse(c, error.code, status);
  }
  const code = error instanceof Error ? error.message : "internal_error";
  if (code === "invalid_json" || code === "request_too_large") {
    return errorResponse(c, code === "request_too_large" ? code : "invalid_json", 400);
  }
  log("error", "unhandled_request_error", {
    requestId: c.get("requestId"),
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    error: error instanceof Error ? error.name : "unknown",
    errorCode: code.startsWith("missing_secret:") ? "missing_secret" : code,
  });
  return errorResponse(c, "internal_error", 500);
});

async function constantTimeStrings(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  if (leftHash.length !== rightHash.length) return false;
  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash[index] ^ rightHash[index];
  }
  return difference === 0;
}

import {
  processDiagnosisMessage,
  queueDueDiagnosisRuns,
  recoverStaleDiagnosisRuns,
} from "./diagnosis/queue";
import type { QueueMessage as SourceQueueMessage } from "./sources";

type AppQueueMessage =
  | SourceQueueMessage
  | AiVisibilityMessage
  | ReleaseCheckMessage
  | import("./diagnosis/queue").DiagnosisMessage;

const worker: ExportedHandler<Cloudflare.Env, AppQueueMessage> = {
  fetch: app.fetch,
  async queue(batch, env): Promise<void> {
    for (const message of batch.messages) {
      try {
        let result: { retry: boolean };
        if (message.body.type === "ai-visibility-scan") {
          result = await processAiVisibilityMessage(env, message.body);
        } else if (message.body.type === "diagnosis-run") {
          result = await processDiagnosisMessage(
            env,
            message.body as import("./diagnosis/queue").DiagnosisMessage,
          );
        } else if (message.body.type === "release-check") {
          result = await processReleaseCheckMessage(env, message.body);
        } else {
          result = await processSyncMessage(env, message.body);
        }
        if (result.retry) {
          message.retry({
            delaySeconds: Math.min(3600, 60 * 2 ** message.attempts),
          });
        } else {
          message.ack();
        }
      } catch (error) {
        const body = message.body as { type?: string; jobId?: string; runId?: string; scanId?: string; checkId?: string };
        log("error", "queue_message_failed", {
          jobId: body.jobId ?? body.runId ?? body.scanId ?? body.checkId,
          provider: body.type ?? "unknown",
          attempts: message.attempts,
          error: error instanceof Error ? error.message : "unknown",
        });
        message.retry({ delaySeconds: Math.min(3600, 60 * 2 ** message.attempts) });
      }
    }
  },
  async scheduled(event, env, ctx): Promise<void> {
    ctx.waitUntil(
      (async () => {
        if (event.cron === "43 2 * * *") {
          const deleted = await deleteExpiredAnalytics(env);
          log("info", "analytics_retention_complete", { deleted });
          return;
        }
        if (event.cron === "7 * * * *") {
          // Background keyword rank refresh is retired.
          log("info", "keyword_ranks_cron_retired");
          return;
        }
        if (event.cron === "23 3 * * *") {
          // AI Visibility scheduled scans are retired from Growth CI product.
          if (areLegacySurfacesEnabled(env)) {
            const aiVisibilityScans = await queueDueAiVisibilityScans(env);
            log("info", "ai_visibility_scheduled_scans_queued", {
              aiVisibilityScans,
            });
          } else {
            log("info", "ai_visibility_cron_retired");
          }
          return;
        }
        const queued = await queueDueSyncs(env);
        log("info", "scheduled_syncs_queued", { queued });

        if (isGrowthCiEnabled(env)) {
          const recoveredChecks = await recoverStaleReleaseChecks(env);
          const releaseChecksQueued = await queueDueReleaseChecks(env);
          log("info", "scheduled_release_checks_queued", {
            recovered: recoveredChecks,
            queued: releaseChecksQueued,
          });
        }

        // Diagnosis catch-up remains for legacy readiness until fully retired.
        if (areLegacySurfacesEnabled(env) || !isGrowthCiEnabled(env)) {
          const recovered = await recoverStaleDiagnosisRuns(env);
          const diagnosisQueued = await queueDueDiagnosisRuns(env);
          log("info", "scheduled_diagnosis_runs_queued", {
            recovered,
            queued: diagnosisQueued,
          });
        }
      })(),
    );
  },
};

export default worker;
