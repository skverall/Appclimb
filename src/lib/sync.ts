/**
 * Server-side cloud sync storage (ADR 0004). Two blobs per user — `tracker`
 * (the full My Apps store) and `explorer` (keyword lists per storefront) —
 * stored in `sync_blobs` with last-write-wins by revision.
 */

export const SYNC_BLOB_KEYS = ["tracker", "explorer"] as const;
export type SyncBlobKey = (typeof SYNC_BLOB_KEYS)[number];

/** Conservative per-blob size cap (D1 rows allow more; keep payloads sane). */
export const MAX_SYNC_BLOB_BYTES = 2 * 1024 * 1024;

export function isSyncBlobKey(raw: unknown): raw is SyncBlobKey {
  return typeof raw === "string" && (SYNC_BLOB_KEYS as readonly string[]).includes(raw);
}

export interface SyncBlobRow {
  revision: number;
  json: string;
  updated_at: string;
}

export async function getSyncBlob(
  db: D1Database,
  userId: string,
  blobKey: SyncBlobKey,
): Promise<SyncBlobRow | null> {
  const row = await db
    .prepare("SELECT revision, json, updated_at FROM sync_blobs WHERE user_id = ? AND blob_key = ?")
    .bind(userId, blobKey)
    .first<SyncBlobRow>();
  return row ?? null;
}

/**
 * Store a blob with last-write-wins semantics. The write only lands when the
 * incoming revision is strictly greater than the stored one; the current row
 * is returned so the client can converge.
 */
export async function putSyncBlob(
  db: D1Database,
  userId: string,
  blobKey: SyncBlobKey,
  json: string,
  revision: number,
): Promise<{ revision: number; applied: boolean }> {
  await db
    .prepare(
      `INSERT INTO sync_blobs (user_id, blob_key, revision, json, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, blob_key) DO UPDATE SET
         revision = excluded.revision,
         json = excluded.json,
         updated_at = excluded.updated_at
       WHERE excluded.revision > sync_blobs.revision`,
    )
    .bind(userId, blobKey, revision, json)
    .run();

  const row = await getSyncBlob(db, userId, blobKey);
  if (!row) return { revision, applied: true };
  return { revision: row.revision, applied: row.revision === revision };
}
