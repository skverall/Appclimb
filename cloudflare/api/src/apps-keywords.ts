import { audit } from "./db";
import { ProviderError } from "./connectors";
import { nowISO } from "./runtime";
import type { AuthContext } from "./types";

const APP_STORE_ORIGIN = "https://itunes.apple.com";
const storefrontPattern = /^[A-Z]{2}$/u;
const keywordPattern = /^[^\u0000-\u001f\u007f]{1,80}$/u;

interface AppStoreResult {
  trackId?: number;
  trackName?: string;
  bundleId?: string;
  sellerName?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  description?: string;
}

interface AppRow {
  id: string;
  name: string;
  platform: string;
  bundle_id: string | null;
  apple_app_id: string | null;
  default_storefront: string;
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

function boundedStorefront(value: string) {
  const storefront = value.trim().toUpperCase();
  if (!storefrontPattern.test(storefront)) {
    throw new ProviderError("invalid_storefront", 400);
  }
  return storefront;
}

function cleanSearchResult(result: AppStoreResult) {
  const appStoreId = Number(result.trackId);
  const name = typeof result.trackName === "string" ? result.trackName.trim() : "";
  if (!Number.isInteger(appStoreId) || appStoreId <= 0 || !name) return null;
  return {
    appStoreId: String(appStoreId),
    name: name.slice(0, 120),
    bundleId:
      typeof result.bundleId === "string" ? result.bundleId.slice(0, 255) : "",
    developer:
      typeof result.sellerName === "string" ? result.sellerName.slice(0, 160) : "",
    genre:
      typeof result.primaryGenreName === "string"
        ? result.primaryGenreName.slice(0, 80)
        : "",
    iconUrl:
      typeof result.artworkUrl100 === "string" ? result.artworkUrl100 : "",
    storeUrl:
      typeof result.trackViewUrl === "string" ? result.trackViewUrl : "",
  };
}

async function appleJSON(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${APP_STORE_ORIGIN}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new ProviderError("app_store_catalog_unavailable", 502, true);
  }
  return (await response.json()) as Record<string, unknown>;
}

export async function searchAppStoreCatalog(query: string, country: string) {
  const term = query.trim();
  if (term.length < 2 || term.length > 80) {
    throw new ProviderError("invalid_app_search", 400);
  }
  const storefront = boundedStorefront(country);
  const parameters = new URLSearchParams({
    term,
    country: storefront,
    media: "software",
    entity: "software",
    limit: "8",
    explicit: "No",
  });
  const payload = await appleJSON(`/search?${parameters}`);
  return (Array.isArray(payload.results) ? payload.results : [])
    .map((result) => cleanSearchResult(result as AppStoreResult))
    .filter((result): result is NonNullable<typeof result> => result !== null);
}

async function lookupAppStoreApp(appStoreId: string, storefront: string) {
  if (!/^\d{1,20}$/u.test(appStoreId)) {
    throw new ProviderError("invalid_app_store_id", 400);
  }
  const parameters = new URLSearchParams({
    id: appStoreId,
    country: boundedStorefront(storefront),
    entity: "software",
  });
  const payload = await appleJSON(`/lookup?${parameters}`);
  const result = (Array.isArray(payload.results) ? payload.results : [])[0];
  const clean = cleanSearchResult((result ?? {}) as AppStoreResult);
  if (!clean) throw new ProviderError("app_not_found_in_storefront", 404);
  return { clean, raw: (result ?? {}) as AppStoreResult };
}

export async function listWorkspaceApps(
  db: D1Database,
  workspaceId: string,
) {
  const rows = await db
    .prepare(
      `SELECT id,name,platform,bundle_id,apple_app_id,default_storefront,created_at
       FROM apps WHERE workspace_id=? ORDER BY created_at,id`,
    )
    .bind(workspaceId)
    .all<AppRow>();
  return rows.results.map((row) => ({
    id: row.id,
    name: row.name,
    platform: row.platform,
    bundleId: row.bundle_id ?? "",
    appStoreId: row.apple_app_id ?? "",
    storefront: row.default_storefront,
    configured: Boolean(row.apple_app_id),
  }));
}

export async function addAppStoreApp(
  env: Cloudflare.Env,
  auth: AuthContext,
  appStoreId: string,
  country: string,
) {
  const storefront = boundedStorefront(country);
  const { clean } = await lookupAppStoreApp(appStoreId, storefront);
  const existing = await env.DB.prepare(
    `SELECT id FROM apps
     WHERE workspace_id=? AND apple_app_id=? LIMIT 1`,
  )
    .bind(auth.workspaceId, clean.appStoreId)
    .first<{ id: string }>();
  if (existing) {
    return { id: existing.id, ...clean, storefront, created: false };
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
       default_storefront=?,updated_at=?
       WHERE id=? AND workspace_id=?`,
    )
      .bind(
        clean.name,
        clean.bundleId || null,
        clean.appStoreId,
        storefront,
        now,
        id,
        auth.workspaceId,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO apps(
        id,workspace_id,name,platform,bundle_id,apple_app_id,
        default_storefront,shared_app_user_id_confirmed,created_at,updated_at
      ) VALUES(?,?,?,'iOS',?,?,?,0,?,?)`,
    )
      .bind(
        id,
        auth.workspaceId,
        clean.name,
        clean.bundleId || null,
        clean.appStoreId,
        storefront,
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
    { catalog: "app-store", appStoreId: clean.appStoreId, storefront },
  );
  return { id, ...clean, storefront, created: true };
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

async function observeKeyword(
  db: D1Database,
  track: KeywordTrackRow,
  appStoreId: string,
  workspaceId: string,
) {
  const parameters = new URLSearchParams({
    term: track.keyword,
    country: boundedStorefront(track.storefront),
    media: "software",
    entity: "software",
    limit: "200",
    explicit: "No",
  });
  const payload = await appleJSON(`/search?${parameters}`);
  const results = Array.isArray(payload.results) ? payload.results : [];
  const index = results.findIndex(
    (result) =>
      String((result as AppStoreResult).trackId ?? "") === appStoreId,
  );
  const observedOn = new Date().toISOString().slice(0, 10);
  await db
    .prepare(
      `INSERT INTO keyword_rank_points(
        id,workspace_id,app_id,keyword_track_id,observed_on,rank,created_at
      ) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(keyword_track_id,observed_on)
      DO UPDATE SET rank=excluded.rank,created_at=excluded.created_at`,
    )
    .bind(
      crypto.randomUUID(),
      workspaceId,
      track.app_id,
      track.id,
      observedOn,
      index >= 0 ? index + 1 : null,
      nowISO(),
    )
    .run();
}

export async function checkKeywordRanks(
  env: Cloudflare.Env,
  auth: AuthContext,
  appId: string,
  maximum = 5,
) {
  const app = await ownedApp(env.DB, auth.workspaceId, appId);
  if (!app.apple_app_id) {
    throw new ProviderError("app_store_app_required", 409);
  }
  const today = new Date().toISOString().slice(0, 10);
  const tracks = await env.DB.prepare(
    `SELECT kt.id,kt.app_id,kt.storefront,kt.keyword,kt.active,kt.created_at
     FROM keyword_tracks kt
     LEFT JOIN keyword_rank_points krp
       ON krp.keyword_track_id=kt.id AND krp.observed_on=?
     WHERE kt.workspace_id=? AND kt.app_id=? AND kt.active=1
       AND krp.id IS NULL
     ORDER BY kt.created_at LIMIT ?`,
  )
    .bind(today, auth.workspaceId, appId, Math.max(1, Math.min(5, maximum)))
    .all<KeywordTrackRow>();
  await Promise.all(
    tracks.results.map((track) =>
      observeKeyword(env.DB, track, app.apple_app_id!, auth.workspaceId),
    ),
  );
  return { checked: tracks.results.length, observedOn: today };
}

export async function refreshDueKeywordRanks(
  env: Cloudflare.Env,
  maximum = 15,
) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await env.DB.prepare(
    `SELECT kt.id,kt.workspace_id,kt.app_id,kt.storefront,kt.keyword,
            kt.active,kt.created_at,a.apple_app_id
     FROM keyword_tracks kt
     JOIN apps a ON a.id=kt.app_id AND a.workspace_id=kt.workspace_id
     LEFT JOIN (
       SELECT keyword_track_id,MAX(observed_on) AS last_observed_on
       FROM keyword_rank_points
       GROUP BY keyword_track_id
     ) latest ON latest.keyword_track_id=kt.id
     WHERE kt.active=1 AND a.apple_app_id IS NOT NULL
       AND (latest.last_observed_on IS NULL OR latest.last_observed_on < ?)
     ORDER BY
       CASE WHEN latest.last_observed_on IS NULL THEN 0 ELSE 1 END,
       latest.last_observed_on,
       kt.created_at
     LIMIT ?`,
  )
    .bind(today, Math.max(1, Math.min(15, maximum)))
    .all<KeywordTrackRow & { workspace_id: string; apple_app_id: string }>();
  await Promise.all(
    rows.results.map((track) =>
      observeKeyword(env.DB, track, track.apple_app_id, track.workspace_id),
    ),
  );
  return rows.results.length;
}

const suggestionStopWords = new Set([
  "and",
  "app",
  "for",
  "from",
  "get",
  "in",
  "is",
  "of",
  "on",
  "the",
  "to",
  "with",
  "your",
]);

export async function keywordSuggestions(
  env: Cloudflare.Env,
  auth: AuthContext,
  appId: string,
) {
  const app = await ownedApp(env.DB, auth.workspaceId, appId);
  if (!app.apple_app_id) {
    throw new ProviderError("app_store_app_required", 409);
  }
  const { raw } = await lookupAppStoreApp(
    app.apple_app_id,
    app.default_storefront,
  );
  const title = String(raw.trackName ?? app.name).toLocaleLowerCase();
  const genre = String(raw.primaryGenreName ?? "").toLocaleLowerCase();
  const words = `${title} ${String(raw.description ?? "")}`
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]{3,}/gu)
    ?.filter((word) => !suggestionStopWords.has(word)) ?? [];
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  const candidates = [
    title,
    genre,
    ...title.split(/\s+/u).map((word) => `${word} ${genre}`.trim()),
    ...[...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12)
      .map(([word]) => word),
  ]
    .map((value) => value.trim().replace(/\s+/gu, " "))
    .filter(
      (value, index, values) =>
        value.length >= 3 &&
        value.length <= 80 &&
        values.indexOf(value) === index,
    )
    .slice(0, 8);
  return candidates.map((keyword, index) => ({
    keyword,
    reason:
      index === 0
        ? "App title"
        : keyword === genre
          ? "App Store category"
          : "Store metadata",
  }));
}
