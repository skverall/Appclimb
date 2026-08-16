import { beforeAll, describe, expect, it } from "vitest";

import { upsertUser } from "@/lib/auth";
import {
  getSyncBlob,
  isSyncBlobKey,
  MAX_SYNC_BLOB_BYTES,
  putSyncBlob,
} from "@/lib/sync";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";
import { loadMigrationSql } from "../../tests/helpers/migration";

let db: FakeD1;

beforeAll(async () => {
  db = await createTestDb(loadMigrationSql());
});

describe("isSyncBlobKey", () => {
  it("accepts only the two known blobs", () => {
    expect(isSyncBlobKey("tracker")).toBe(true);
    expect(isSyncBlobKey("explorer")).toBe(true);
    expect(isSyncBlobKey("history")).toBe(false);
    expect(isSyncBlobKey(undefined)).toBe(false);
    expect(isSyncBlobKey(3)).toBe(false);
  });

  it("has a sane size cap", () => {
    expect(MAX_SYNC_BLOB_BYTES).toBeGreaterThan(0);
  });
});

describe("sync blobs (LWW)", () => {
  it("returns null for a missing blob", async () => {
    const user = await upsertUser(db, { email: "sync-empty@example.com" });
    expect(await getSyncBlob(db, user.id, "tracker")).toBeNull();
  });

  it("stores a first revision and applies it", async () => {
    const user = await upsertUser(db, { email: "sync-first@example.com" });
    const result = await putSyncBlob(db, user.id, "tracker", '{"v":1}', 1);
    expect(result).toEqual({ revision: 1, applied: true });
    const blob = await getSyncBlob(db, user.id, "tracker");
    expect(blob?.json).toBe('{"v":1}');
    expect(blob?.revision).toBe(1);
  });

  it("applies a higher revision and rejects a stale one", async () => {
    const user = await upsertUser(db, { email: "sync-lww@example.com" });
    await putSyncBlob(db, user.id, "tracker", '{"v":1}', 1);
    const newer = await putSyncBlob(db, user.id, "tracker", '{"v":2}', 2);
    expect(newer).toEqual({ revision: 2, applied: true });
    expect((await getSyncBlob(db, user.id, "tracker"))?.json).toBe('{"v":2}');

    const stale = await putSyncBlob(db, user.id, "tracker", '{"v":0}', 1);
    expect(stale.applied).toBe(false);
    expect(stale.revision).toBe(2);
    expect((await getSyncBlob(db, user.id, "tracker"))?.json).toBe('{"v":2}');
  });

  it("keeps blobs independent per key and user", async () => {
    const alice = await upsertUser(db, { email: "sync-alice@example.com" });
    const bob = await upsertUser(db, { email: "sync-bob@example.com" });
    await putSyncBlob(db, alice.id, "tracker", '{"a":1}', 1);
    await putSyncBlob(db, alice.id, "explorer", '{"e":1}', 1);
    await putSyncBlob(db, bob.id, "tracker", '{"b":1}', 1);
    expect((await getSyncBlob(db, alice.id, "tracker"))?.json).toBe('{"a":1}');
    expect((await getSyncBlob(db, alice.id, "explorer"))?.json).toBe('{"e":1}');
    expect((await getSyncBlob(db, bob.id, "tracker"))?.json).toBe('{"b":1}');
    expect(await getSyncBlob(db, bob.id, "explorer")).toBeNull();
  });
});
