/**
 * Client-side cloud sync helpers (ADR 0004, Pro feature).
 *
 * Two blobs are synced: `tracker` (the full My Apps store) and `explorer`
 * (keyword lists per storefront). Revisions are tracked locally in
 * `appclimb:sync:v1`; conflicts resolve last-write-wins on the server.
 */
import { SUPPORTED_COUNTRIES, loadKeywordList } from "./aso";

export const SYNC_META_KEY = "appclimb:sync:v1";
export const SYNC_CHANGE_EVENT = "appclimb:sync:change";

export type SyncBlobKey = "tracker" | "explorer";

export interface SyncMeta {
  tracker: number;
  explorer: number;
}

export function emptySyncMeta(): SyncMeta {
  return { tracker: 0, explorer: 0 };
}

export function readSyncMeta(storage: Storage): SyncMeta {
  const fallback = emptySyncMeta();
  try {
    const raw = storage.getItem(SYNC_META_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SyncMeta>;
    return {
      tracker:
        typeof parsed.tracker === "number" && Number.isFinite(parsed.tracker) && parsed.tracker > 0
          ? parsed.tracker
          : 0,
      explorer:
        typeof parsed.explorer === "number" &&
        Number.isFinite(parsed.explorer) &&
        parsed.explorer > 0
          ? parsed.explorer
          : 0,
    };
  } catch {
    return fallback;
  }
}

export function writeSyncMeta(storage: Storage, meta: SyncMeta): void {
  try {
    storage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    // Storage full or unavailable; sync meta is recoverable.
  }
}

/** Collect the explorer keyword lists for every supported storefront. */
export function collectExplorerLists(storage: Storage): Record<string, string[]> {
  const lists: Record<string, string[]> = {};
  for (const country of SUPPORTED_COUNTRIES) {
    const list = loadKeywordList(storage, country.code);
    if (list.length > 0) lists[country.code] = list;
  }
  return lists;
}

export interface RemoteSyncBlob {
  json: string | null;
  revision: number;
}

/** Fetch a blob. Returns null when sync is unavailable or not allowed. */
export async function fetchSyncBlob(blobKey: SyncBlobKey): Promise<RemoteSyncBlob | null> {
  try {
    const res = await fetch(`/api/sync?blob=${encodeURIComponent(blobKey)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { json?: string | null; revision?: number };
    const revision =
      typeof data.revision === "number" && data.revision > 0 ? data.revision : 0;
    return { json: typeof data.json === "string" ? data.json : null, revision };
  } catch {
    return null;
  }
}

export interface UploadSyncResult {
  revision: number;
  applied: boolean;
}

/** Upload a blob with last-write-wins revision. Returns null on failure. */
export async function uploadSyncBlob(
  blobKey: SyncBlobKey,
  json: string,
  revision: number,
): Promise<UploadSyncResult | null> {
  try {
    const res = await fetch(`/api/sync?blob=${encodeURIComponent(blobKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json, revision }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { revision?: number; applied?: boolean };
    if (typeof data.revision !== "number") return null;
    return { revision: data.revision, applied: data.applied === true };
  } catch {
    return null;
  }
}

/** Notify the sync controller that a blob changed locally. */
export function notifySyncChange(blobKey: SyncBlobKey): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SYNC_CHANGE_EVENT, { detail: { blobKey } }));
}
