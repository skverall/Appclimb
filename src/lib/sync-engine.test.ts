import { afterEach, describe, expect, it, vi } from "vitest";

import { addKeywordToList } from "@/lib/aso";
import {
  applyExplorerJson,
  applyTrackerJson,
  clearLocalWorkspaceData,
  explorerHasData,
  explorerLocalJson,
  pushSyncBlob,
  reconcileSyncBlob,
  trackerHasData,
  trackerLocalJson,
} from "@/lib/sync-engine";
import { readSyncMeta } from "@/lib/sync-client";
import { addTrackedApp, emptyStore, loadTrackerStore, saveTrackerStore } from "@/lib/tracker";
import { makeStorage } from "../../tests/helpers/make-storage";

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Minimal fake /api/sync server with LWW semantics, backed by a Map. */
function fakeSyncServer() {
  const blobs = new Map<string, { json: string | null; revision: number }>();
  const fetchImpl = vi.fn<FetchFn>(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const blobKey = url.searchParams.get("blob") ?? "";
    const method = init?.method ?? "GET";
    if (method === "PUT") {
      const body = JSON.parse(String(init?.body)) as { json: string; revision: number };
      const existing = blobs.get(blobKey) ?? { json: null, revision: 0 };
      if (body.revision > existing.revision) {
        blobs.set(blobKey, { json: body.json, revision: body.revision });
      }
      const row = blobs.get(blobKey) ?? { json: null, revision: 0 };
      return Response.json({ ok: true, revision: row.revision, applied: row.revision === body.revision });
    }
    const row = blobs.get(blobKey) ?? { json: null, revision: 0 };
    return Response.json(row);
  });
  return { blobs, fetchImpl };
}

const sampleApp = {
  appStoreId: "123456789",
  name: "Calm Focus",
  bundleId: "com.example.calm",
  developer: "Indie Labs",
  genre: "Health & Fitness",
  iconUrl: "https://example.com/icon.png",
  storeUrl: "https://apps.apple.com/app/id123456789",
  country: "US",
};

function seedTrackerStorage() {
  const storage = makeStorage();
  const store = addTrackedApp(emptyStore(), sampleApp).store;
  saveTrackerStore(storage, store);
  return storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local shape helpers", () => {
  it("trackerHasData / trackerLocalJson round-trip", () => {
    const storage = seedTrackerStorage();
    expect(trackerHasData(storage)).toBe(true);
    const json = trackerLocalJson(storage);
    expect(JSON.parse(json).apps).toHaveLength(1);
  });

  it("explorerHasData / explorerLocalJson reflect keyword lists", () => {
    const storage = makeStorage();
    expect(explorerHasData(storage)).toBe(false);
    addKeywordToList(storage, "US", "meditation");
    addKeywordToList(storage, "DE", "achtsamkeit");
    expect(explorerHasData(storage)).toBe(true);
    const lists = JSON.parse(explorerLocalJson(storage)) as Record<string, string[]>;
    expect(lists.US).toEqual(["meditation"]);
    expect(lists.DE).toEqual(["achtsamkeit"]);
  });

  it("clearLocalWorkspaceData removes tracker, explorer history, and sync meta", () => {
    const storage = seedTrackerStorage();
    addKeywordToList(storage, "US", "meditation");
    storage.setItem("appclimb:kw:v1:US:meditation", "{}");
    storage.setItem("appclimb:sync:v1", JSON.stringify({ tracker: 3, explorer: 2 }));
    storage.setItem("appclimb:onboarded:v1", "user-1");
    storage.setItem("appclimb:ai:conversations:v1", "[]");

    clearLocalWorkspaceData(storage);

    expect(trackerHasData(storage)).toBe(false);
    expect(explorerHasData(storage)).toBe(false);
    expect(storage.getItem("appclimb:kw:v1:US:meditation")).toBeNull();
    expect(storage.getItem("appclimb:sync:v1")).toBeNull();
    expect(readSyncMeta(storage).tracker).toBe(0);
    // Unrelated keys survive (device-level settings, not account data).
    expect(storage.getItem("appclimb:onboarded:v1")).toBe("user-1");
    expect(storage.getItem("appclimb:ai:conversations:v1")).toBe("[]");
  });
});

describe("apply*Json validation", () => {
  it("applyTrackerJson rejects garbage and empty stores", () => {
    const storage = makeStorage();
    expect(applyTrackerJson(storage, "not json")).toBe(false);
    expect(applyTrackerJson(storage, JSON.stringify({ nope: true }))).toBe(false);
    expect(trackerHasData(storage)).toBe(false);
  });

  it("applyTrackerJson adopts a valid store", () => {
    const storage = makeStorage();
    const valid = trackerLocalJson(seedTrackerStorage());
    expect(applyTrackerJson(storage, valid)).toBe(true);
    expect(loadTrackerStore(storage).apps[0]?.name).toBe("Calm Focus");
  });

  it("applyExplorerJson filters unknown storefronts and junk", () => {
    const storage = makeStorage();
    expect(applyExplorerJson(storage, "bad json")).toBe(false);
    expect(
      applyExplorerJson(
        storage,
        JSON.stringify({ US: ["meditation"], XX: ["nope"], DE: [42] }),
      ),
    ).toBe(true);
    const lists = JSON.parse(explorerLocalJson(storage)) as Record<string, string[]>;
    expect(lists.US).toEqual(["meditation"]);
    expect(lists.XX).toBeUndefined();
    // Empty lists (junk filtered out) are not synced.
    expect(lists.DE).toBeUndefined();
  });
});

describe("reconcileSyncBlob", () => {
  it("imports local data to an empty cloud (one-shot push)", async () => {
    const { blobs, fetchImpl } = fakeSyncServer();
    vi.stubGlobal("fetch", fetchImpl);
    const storage = seedTrackerStorage();
    const result = await reconcileSyncBlob(storage, "tracker", true, trackerLocalJson(storage));
    expect(result.ok).toBe(true);
    expect(result.pushed).toBe(true);
    expect(result.revision).toBe(1);
    expect(blobs.get("tracker")?.revision).toBe(1);
    expect(readSyncMeta(storage).tracker).toBe(1);
  });

  it("adopts remote data on a device with nothing local (pull)", async () => {
    const { blobs, fetchImpl } = fakeSyncServer();
    blobs.set("tracker", { json: trackerLocalJson(seedTrackerStorage()), revision: 4 });
    vi.stubGlobal("fetch", fetchImpl);
    const storage = makeStorage();
    const result = await reconcileSyncBlob(storage, "tracker", false, null);
    expect(result.pulled).toBe(true);
    expect(result.revision).toBe(4);
    expect(loadTrackerStore(storage).apps[0]?.name).toBe("Calm Focus");
    expect(readSyncMeta(storage).tracker).toBe(4);
  });

  it("remote wins when it has a newer revision than this device", async () => {
    const { blobs, fetchImpl } = fakeSyncServer();
    const remoteStore = addTrackedApp(emptyStore(), { ...sampleApp, name: "Remote App" }).store;
    blobs.set("tracker", { json: JSON.stringify(remoteStore), revision: 9 });
    vi.stubGlobal("fetch", fetchImpl);

    const storage = seedTrackerStorage();
    // Simulate this device having synced up to revision 5 previously.
    storage.setItem(
      "appclimb:sync:v1",
      JSON.stringify({ tracker: 5, explorer: 0 }),
    );
    const result = await reconcileSyncBlob(storage, "tracker", true, trackerLocalJson(storage));
    expect(result.pulled).toBe(true);
    expect(loadTrackerStore(storage).apps[0]?.name).toBe("Remote App");
  });

  it("returns ok:false when the endpoint is unavailable", async () => {
    type FetchFn2 = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", vi.fn<FetchFn2>(async () => new Response("nope", { status: 503 })));
    const storage = seedTrackerStorage();
    const result = await reconcileSyncBlob(storage, "tracker", true, trackerLocalJson(storage));
    expect(result.ok).toBe(false);
    expect(readSyncMeta(storage).tracker).toBe(0);
  });
});

describe("pushSyncBlob", () => {
  it("pushes with the next revision and records it locally", async () => {
    const { blobs, fetchImpl } = fakeSyncServer();
    vi.stubGlobal("fetch", fetchImpl);
    const storage = seedTrackerStorage();
    const first = await pushSyncBlob(storage, "tracker", trackerLocalJson(storage));
    expect(first?.applied).toBe(true);
    expect(first?.revision).toBe(1);
    const second = await pushSyncBlob(storage, "tracker", trackerLocalJson(storage));
    expect(second?.revision).toBe(2);
    expect(blobs.get("tracker")?.revision).toBe(2);
    expect(readSyncMeta(storage).tracker).toBe(2);
  });
});
