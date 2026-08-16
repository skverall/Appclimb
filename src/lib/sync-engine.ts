/**
 * Client-side sync orchestration (ADR 0004, Pro feature).
 *
 * Rules are deliberately simple and predictable:
 * - A device with no local data adopts the remote blob (pull).
 * - A device with local data that has never synced imports it to the cloud
 *   (one-shot local → cloud on first enablement).
 * - Otherwise last-write-wins by revision, with remote winning ties.
 */
import { SUPPORTED_COUNTRIES, saveKeywordList, type KeywordStorage } from "./aso";
import { loadTrackerStore, saveTrackerStore } from "./tracker";
import {
  collectExplorerLists,
  fetchSyncBlob,
  readSyncMeta,
  uploadSyncBlob,
  writeSyncMeta,
  type SyncBlobKey,
} from "./sync-client";

const VALID_COUNTRIES = new Set(SUPPORTED_COUNTRIES.map((item) => item.code));

/** Storage wrapper that serves a single raw JSON string (for validation). */
function memoryStorage(json: string): KeywordStorage {
  return {
    getItem: () => json,
    setItem: () => {},
    removeItem: () => {},
    key: () => null,
    length: 0,
  };
}

export function trackerHasData(storage: Storage): boolean {
  return loadTrackerStore(storage).apps.length > 0;
}

export function trackerLocalJson(storage: Storage): string {
  return JSON.stringify(loadTrackerStore(storage));
}

/** Validate + adopt a remote tracker blob. Returns false when unusable. */
export function applyTrackerJson(storage: Storage, json: string): boolean {
  try {
    const parsed = loadTrackerStore(memoryStorage(json));
    if (parsed.apps.length === 0) return false;
    saveTrackerStore(storage, parsed);
    return true;
  } catch {
    return false;
  }
}

export function explorerHasData(storage: Storage): boolean {
  return Object.keys(collectExplorerLists(storage)).length > 0;
}

export function explorerLocalJson(storage: Storage): string {
  return JSON.stringify(collectExplorerLists(storage));
}

/** Validate + adopt remote explorer lists. Returns false when unusable. */
export function applyExplorerJson(storage: Storage, json: string): boolean {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    let applied = false;
    for (const [country, list] of Object.entries(parsed)) {
      if (!VALID_COUNTRIES.has(country) || !Array.isArray(list)) continue;
      const clean = list
        .filter((item): item is string => typeof item === "string" && item.length > 0)
        .slice(0, 200);
      saveKeywordList(storage, country, clean);
      applied = true;
    }
    return applied;
  } catch {
    return false;
  }
}

export interface SyncPassResult {
  ok: boolean;
  pulled: boolean;
  pushed: boolean;
  revision: number;
}

/** Pull-or-push one blob so this device converges with the cloud. */
export async function reconcileSyncBlob(
  storage: Storage,
  blobKey: SyncBlobKey,
  hasLocal: boolean,
  localJson: string | null,
): Promise<SyncPassResult> {
  const meta = readSyncMeta(storage);
  const localRev = meta[blobKey];
  const remote = await fetchSyncBlob(blobKey);
  if (!remote) {
    return { ok: false, pulled: false, pushed: false, revision: localRev };
  }

  const apply = (json: string) =>
    blobKey === "tracker" ? applyTrackerJson(storage, json) : applyExplorerJson(storage, json);

  if (!hasLocal || (localRev > 0 && remote.revision > localRev)) {
    if (remote.json !== null && apply(remote.json)) {
      writeSyncMeta(storage, { ...meta, [blobKey]: remote.revision });
      return { ok: true, pulled: true, pushed: false, revision: remote.revision };
    }
  }

  if (localJson) {
    const nextRev = Math.max(localRev, remote.revision) + 1;
    const result = await uploadSyncBlob(blobKey, localJson, nextRev);
    if (result) {
      writeSyncMeta(storage, { ...meta, [blobKey]: result.revision });
      return { ok: true, pulled: false, pushed: result.applied, revision: result.revision };
    }
  }

  return { ok: false, pulled: false, pushed: false, revision: localRev };
}

export interface PushResult {
  applied: boolean;
  revision: number;
}

/** Push the latest local state after a local change. Returns null on failure. */
export async function pushSyncBlob(
  storage: Storage,
  blobKey: SyncBlobKey,
  localJson: string,
): Promise<PushResult | null> {
  const meta = readSyncMeta(storage);
  const nextRev = meta[blobKey] + 1;
  const result = await uploadSyncBlob(blobKey, localJson, nextRev);
  if (!result) return null;
  writeSyncMeta(storage, { ...meta, [blobKey]: result.revision });
  return { applied: result.applied, revision: result.revision };
}
