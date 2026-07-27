import { audit } from "./db";
import { ProviderError } from "./connectors";
import { nowISO } from "./runtime";
import type { AuthContext } from "./types";
import { ensureWebPropertyForApp } from "./web-analytics";

// Apple's iTunes Search API blocks traffic from Cloudflare Workers IP ranges
// (403 / 429). Catalog search, app lookup, keyword rank checks, and metadata
// suggestions therefore run from the user's browser (iTunes allows this via
// `access-control-allow-origin: *`). This module only persists what the client
// already observed; it never calls itunes.apple.com from the server.

const storefrontPattern = /^[A-Z]{2}$/u;
const keywordPattern = /^[^\u0000-\u001f\u007f]{1,80}$/u;

interface AppRow {
  id: string;
  name: string;
  platform: string;
  bundle_id: string | null;
  apple_app_id: string | null;
  default_storefront: string;
  icon_url?: string | null;
  created_at: string;
}

interface KeywordTrackRow {
  id: string;
  workspace_id?: string;
  app_id: string;
  storefront: string;
  keyword: string;
  active: number;
  created_at: string;
}

interface KeywordRankRow {
  keyword_track_id: string;
  observed_on: string;
  rank: number | null;
}

/**
 * Cleaned catalog metadata sent from the browser after a successful iTunes
 * search/lookup. Every field is bounded to its column limit so a hostile
 * payload cannot overflow D1, and appStoreId must be numeric.
 */
export interface ClientAppMetadata {
  appStoreId: string;
  name: string;
  bundleId?: string;
  developer?: string;
  genre?: string;
  iconUrl?: string;
  storeUrl?: string;
}

function boundedStorefront(value: string) {
  const storefront = value.trim().toUpperCase();
  if (!storefrontPattern.test(storefront)) {
    throw new ProviderError("invalid_storefront", 400);
  }
  return storefront;
}

export function sanitizeClientAppMetadata(
  raw: Record<string, unknown>,
): ClientAppMetadata {
  const appStoreId =
    typeof raw.appStoreId === "string" ? raw.appStoreId.trim() : "";
  if (!/^\d{1,20}$/u.test(appStoreId)) {
    throw new ProviderError("invalid_app_store_id", 400);
  }
  const name =
    typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : "";
  if (!name) {
    throw new ProviderError("invalid_app_metadata", 400);
  }
  return {
    appStoreId,
    name,
    bundleId:
      typeof raw.bundleId === "string" ? raw.bundleId.slice(0, 255) : "",
    developer:
      typeof raw.developer === "string" ? raw.developer.slice(0, 160) : "",
    genre: typeof raw.genre === "string" ? raw.genre.slice(0, 80) : "",
    iconUrl: typeof raw.iconUrl === "string" ? raw.iconUrl.slice(0, 1024) : "",
    storeUrl: typeof raw.storeUrl === "string" ? raw.storeUrl.slice(0, 1024) : "",
  };
}

export interface WebAppMetadata {
  domain: string;
  name: string;
  iconUrl?: string;
}

export function sanitizeWebAppMetadata(
  raw: Record<string, unknown>,
): WebAppMetadata {
  const rawDomain =
    typeof raw.domain === "string" ? raw.domain.trim().toLowerCase() : "";
  const domain = rawDomain
    .replace(/^https?:\/\//u, "")
    .replace(/^www\./u, "")
    .replace(/\/.*$/u, "")
    .replace(/:\d+$/u, "")
    .replace(/\.$/u, "");
  if (
    !domain ||
    domain.length > 253 ||
    !domain.includes(".") ||
    /[ /:@?#]/u.test(domain)
  ) {
    throw new ProviderError("invalid_domain", 400);
  }
  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim().slice(0, 120)
      : domain;
  const iconUrl =
    typeof raw.iconUrl === "string" && raw.iconUrl.trim()
      ? raw.iconUrl.slice(0, 1024)
      : `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;

  return { domain, name, iconUrl };
}

export async function addWebApp(
  env: Cloudflare.Env,
  auth: AuthContext,
  metadata: WebAppMetadata,
) {
  const catalogKey = `web:${metadata.domain}`;
  const existing = await env.DB.prepare(
    `SELECT id FROM apps WHERE workspace_id=? AND (apple_app_id=? OR bundle_id=?) LIMIT 1`,
  )
    .bind(auth.workspaceId, catalogKey, metadata.domain)
    .first<{ id: string }>();

  const id = existing?.id ?? crypto.randomUUID();
  const now = nowISO();
  let created = false;

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO apps(
        id, workspace_id, name, platform, bundle_id, apple_app_id,
        default_storefront, icon_url, shared_app_user_id_confirmed, created_at, updated_at
      ) VALUES(?,?,?,'Web',?,?,?,?,0,?,?)`,
    )
      .bind(
        id,
        auth.workspaceId,
        metadata.name,
        metadata.domain,
        catalogKey,
        "US",
        metadata.iconUrl || null,
        now,
        now,
      )
      .run();

    await audit(
      env.DB,
      auth.workspaceId,
      auth.userId,
      "app.add",
      "apps",
      id,
      { platform: "web", domain: metadata.domain, name: metadata.name },
    );
    created = true;
  }

  // Always ensure Acquisition Atlas has a property + signed token for this
  // domain so the add flow returns immediately useful install data.
  const property = await ensureWebPropertyForApp(
    env,
    auth,
    id,
    metadata.name,
    metadata.domain,
  );

  return {
    id,
    name: metadata.name,
    platform: "Web",
    bundleId: metadata.domain,
    appStoreId: catalogKey,
    storefront: "US",
    iconUrl: metadata.iconUrl,
    created,
    property: {
      id: property.id,
      name: property.name,
      domain: property.domain,
      trackingToken: property.trackingToken,
      tokenVersion: property.tokenVersion,
      retentionDays: property.retentionDays,
      createdAt: property.createdAt,
      created: property.created,
    },
    nextSteps: [
      "Install the AppClimb tracking snippet on this domain",
      "Open Acquisition Atlas to verify first visitors and crawlers",
      "Connect PostHog later for product-behavior events",
    ],
  };
}

export async function listWorkspaceApps(
  db: D1Database,
  workspaceId: string,
) {
  const rows = await db
    .prepare(
      `SELECT id,name,platform,bundle_id,apple_app_id,default_storefront,icon_url,created_at
       FROM apps WHERE workspace_id=? ORDER BY created_at,id`,
    )
    .bind(workspaceId)
    .all<AppRow>();
  return rows.results.map((row) => {
    const bundleId = row.bundle_id ?? "";
    const isWeb = row.platform === "Web";
    const iconUrl =
      row.icon_url ||
      (isWeb && bundleId
        ? `https://icons.duckduckgo.com/ip3/${encodeURIComponent(bundleId)}.ico`
        : "");
    return {
      id: row.id,
      name: row.name,
      platform: row.platform,
      bundleId,
      appStoreId: row.apple_app_id ?? "",
      storefront: row.default_storefront,
      iconUrl,
      configured: Boolean(row.apple_app_id),
    };
  });
}

export async function addAppStoreApp(
  env: Cloudflare.Env,
  auth: AuthContext,
  metadata: ClientAppMetadata,
  rawStorefront: string,
) {
  const storefront = boundedStorefront(rawStorefront);
  const existing = await env.DB.prepare(
    `SELECT id FROM apps
     WHERE workspace_id=? AND apple_app_id=? LIMIT 1`,
  )
    .bind(auth.workspaceId, metadata.appStoreId)
    .first<{ id: string }>();
  if (existing) {
    return { id: existing.id, ...metadata, storefront, created: false };
  }
  const placeholder = await env.DB.prepare(
    `SELECT a.id,
       (SELECT COUNT(*) FROM source_connections sc WHERE sc.app_id=a.id) AS source_count,
       (SELECT COUNT(*) FROM keyword_tracks kt WHERE kt.app_id=a.id) AS keyword_count,
       (SELECT COUNT(*) FROM metric_points mp WHERE mp.app_id=a.id) AS metric_count
     FROM apps a
     WHERE a.workspace_id=? AND a.apple_app_id IS NULL
     ORDER BY a.created_at LIMIT 1`,
  )
    .bind(auth.workspaceId)
    .first<{
      id: string;
      source_count: number;
      keyword_count: number;
      metric_count: number;
    }>();
  const canReplacePlaceholder =
    placeholder &&
    Number(placeholder.source_count) === 0 &&
    Number(placeholder.keyword_count) === 0 &&
    Number(placeholder.metric_count) === 0;
  const id = canReplacePlaceholder ? placeholder.id : crypto.randomUUID();
  const now = nowISO();
  if (canReplacePlaceholder) {
    await env.DB.prepare(
      `UPDATE apps SET name=?,bundle_id=?,apple_app_id=?,
       default_storefront=?,icon_url=?,updated_at=?
       WHERE id=? AND workspace_id=?`,
    )
      .bind(
        metadata.name,
        metadata.bundleId || null,
        metadata.appStoreId,
        storefront,
        metadata.iconUrl || null,
        now,
        id,
        auth.workspaceId,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO apps(
        id,workspace_id,name,platform,bundle_id,apple_app_id,
        default_storefront,icon_url,shared_app_user_id_confirmed,created_at,updated_at
      ) VALUES(?,?,?,'iOS',?,?,?,?,0,?,?)`,
    )
      .bind(
        id,
        auth.workspaceId,
        metadata.name,
        metadata.bundleId || null,
        metadata.appStoreId,
        storefront,
        metadata.iconUrl || null,
        now,
        now,
      )
      .run();
  }

  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "app.added",
    "app",
    id,
    {
      catalog: "app-store",
      appStoreId: metadata.appStoreId,
      storefront,
      observedByClient: true,
    },
  );
  return { id, ...metadata, storefront, created: true };
}

async function ownedApp(
  db: D1Database,
  workspaceId: string,
  appId: string,
) {
  const row = await db
    .prepare(
      `SELECT id,name,platform,bundle_id,apple_app_id,default_storefront,created_at
       FROM apps WHERE id=? AND workspace_id=?`,
    )
    .bind(appId, workspaceId)
    .first<AppRow>();
  if (!row) throw new ProviderError("app_not_found", 404);
  return row;
}

export async function addKeywordTrack(
  env: Cloudflare.Env,
  auth: AuthContext,
  appId: string,
  rawKeyword: string,
  rawStorefront: string,
) {
  const app = await ownedApp(env.DB, auth.workspaceId, appId);
  if (!app.apple_app_id) {
    throw new ProviderError("app_store_app_required", 409);
  }
  const keyword = rawKeyword.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
  if (!keywordPattern.test(keyword)) {
    throw new ProviderError("invalid_keyword", 400);
  }
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM keyword_tracks
     WHERE app_id=? AND active=1`,
  )
    .bind(appId)
    .first<{ total: number }>();
  if (Number(count?.total ?? 0) >= 100) {
    throw new ProviderError("keyword_limit_reached", 409);
  }
  const storefront = boundedStorefront(rawStorefront || app.default_storefront);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO keyword_tracks(
      id,workspace_id,app_id,storefront,keyword,active,created_at
    ) VALUES(?,?,?,?,?,1,?)
    ON CONFLICT(app_id,storefront,keyword) DO UPDATE SET active=1`,
  )
    .bind(id, auth.workspaceId, appId, storefront, keyword, nowISO())
    .run();
  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "keyword.added",
    "app",
    appId,
    { keyword, storefront },
  );
  return { appId, keyword, storefront };
}

export async function listKeywordTracks(
  db: D1Database,
  workspaceId: string,
  appId: string,
) {
  await ownedApp(db, workspaceId, appId);
  const [tracks, ranks] = await Promise.all([
    db
      .prepare(
        `SELECT id,app_id,storefront,keyword,active,created_at
         FROM keyword_tracks
         WHERE workspace_id=? AND app_id=? AND active=1
         ORDER BY created_at,keyword`,
      )
      .bind(workspaceId, appId)
      .all<KeywordTrackRow>(),
    db
      .prepare(
        `SELECT krp.keyword_track_id,krp.observed_on,krp.rank
         FROM keyword_rank_points krp
         JOIN keyword_tracks kt ON kt.id=krp.keyword_track_id
         WHERE kt.workspace_id=? AND kt.app_id=?
         ORDER BY krp.observed_on DESC`,
      )
      .bind(workspaceId, appId)
      .all<KeywordRankRow>(),
  ]);
  const history = new Map<string, KeywordRankRow[]>();
  for (const row of ranks.results) {
    const values = history.get(row.keyword_track_id) ?? [];
    if (values.length < 14) values.push(row);
    history.set(row.keyword_track_id, values);
  }
  return tracks.results.map((track) => {
    const points = history.get(track.id) ?? [];
    const latest = points[0];
    const previous = points.find((point) => point.rank !== latest?.rank);
    const trend =
      latest?.rank != null && previous?.rank != null
        ? previous.rank - latest.rank
        : null;
    return {
      id: track.id,
      keyword: track.keyword,
      storefront: track.storefront,
      rank: latest?.rank ?? null,
      checked: Boolean(latest),
      checkedAt: latest?.observed_on ?? null,
      trend,
      popularity: null,
      popularitySource: "apple-ads-required",
      history: [...points]
        .reverse()
        .map((point) => ({ date: point.observed_on, rank: point.rank })),
    };
  });
}

export interface ClientKeywordObservation {
  keyword: string;
  storefront: string;
  rank: number | null;
}

/**
 * Persist keyword rank observations collected by the browser from iTunes.
 * Each observation is matched against tracks owned by the workspace so a
 * client cannot write ranks for keywords that are not tracked for this app.
 * Upserts on (keyword_track_id, observed_on) exactly like the previous server
 * `observeKeyword`.
 */
export async function recordKeywordObservations(
  env: Cloudflare.Env,
  auth: AuthContext,
  appId: string,
  observations: ClientKeywordObservation[],
) {
  const app = await ownedApp(env.DB, auth.workspaceId, appId);
  if (!app.apple_app_id) {
    throw new ProviderError("app_store_app_required", 409);
  }
  const tracks = await env.DB.prepare(
    `SELECT id,storefront,keyword FROM keyword_tracks
     WHERE workspace_id=? AND app_id=? AND active=1`,
  )
    .bind(auth.workspaceId, appId)
    .all<{ id: string; storefront: string; keyword: string }>();
  const byKey = new Map<string, string>();
  for (const track of tracks.results) {
    byKey.set(`${track.storefront}\u0000${track.keyword}`, track.id);
  }
  const observedOn = new Date().toISOString().slice(0, 10);
  let applied = 0;
  for (const observation of observations.slice(0, 50)) {
    const keyword = observation.keyword
      .trim()
      .replace(/\s+/gu, " ")
      .toLocaleLowerCase();
    const storefront = boundedStorefront(observation.storefront);
    const rank =
      observation.rank == null
        ? null
        : Math.max(1, Math.min(200, Math.trunc(observation.rank)));
    const trackId = byKey.get(`${storefront}\u0000${keyword}`);
    if (!trackId) continue;
    await env.DB.prepare(
      `INSERT INTO keyword_rank_points(
        id,workspace_id,app_id,keyword_track_id,observed_on,rank,created_at
      ) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(keyword_track_id,observed_on)
      DO UPDATE SET rank=excluded.rank,created_at=excluded.created_at`,
    )
      .bind(
        crypto.randomUUID(),
        auth.workspaceId,
        appId,
        trackId,
        observedOn,
        rank,
        nowISO(),
      )
      .run();
    applied += 1;
  }
  if (applied > 0) {
    await audit(
      env.DB,
      auth.workspaceId,
      auth.userId,
      "keyword.observed",
      "app",
      appId,
      { observedOn, applied },
    );
  }
  return { observedOn, applied };
}

export async function updateWorkspaceApp(
  env: Cloudflare.Env,
  auth: AuthContext,
  name: string,
  storefront?: string,
) {
  const trimmedName = name.trim().slice(0, 120);
  if (!trimmedName) {
    throw new ProviderError("invalid_app_name", 400);
  }
  const app = await env.DB.prepare(
    "SELECT id FROM apps WHERE workspace_id = ? ORDER BY created_at LIMIT 1",
  )
    .bind(auth.workspaceId)
    .first<{ id: string }>();
  if (!app) {
    throw new ProviderError("app_not_found", 404);
  }
  const now = nowISO();
  const validStorefront = storefront ? boundedStorefront(storefront) : undefined;
  if (validStorefront) {
    await env.DB.prepare(
      "UPDATE apps SET name = ?, default_storefront = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
    )
      .bind(trimmedName, validStorefront, now, app.id, auth.workspaceId)
      .run();
  } else {
    await env.DB.prepare(
      "UPDATE apps SET name = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
    )
      .bind(trimmedName, now, app.id, auth.workspaceId)
      .run();
  }
  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "app.updated",
    "app",
    app.id,
    { name: trimmedName, storefront: validStorefront },
  );
  return { id: app.id, name: trimmedName, storefront: validStorefront };
}

export async function deleteWorkspaceApp(
  env: Cloudflare.Env,
  auth: AuthContext,
  appId: string,
) {
  const app = await env.DB.prepare(
    "SELECT id, name FROM apps WHERE id = ? AND workspace_id = ?",
  )
    .bind(appId, auth.workspaceId)
    .first<{ id: string; name: string }>();
  if (!app) {
    throw new ProviderError("app_not_found", 404);
  }

  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM apps WHERE workspace_id = ?",
  )
    .bind(auth.workspaceId)
    .first<{ total: number }>();

  if ((countRow?.total ?? 0) <= 1) {
    throw new ProviderError("cannot_delete_only_app", 400);
  }

  await env.DB.prepare("DELETE FROM apps WHERE id = ? AND workspace_id = ?")
    .bind(appId, auth.workspaceId)
    .run();

  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "app.deleted",
    "app",
    appId,
    { name: app.name },
  );

  return { id: appId, deleted: true };
}
