import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getPlanForUser } from "@/lib/entitlement";
import {
  getSyncBlob,
  isSyncBlobKey,
  MAX_SYNC_BLOB_BYTES,
  putSyncBlob,
  type SyncBlobKey,
} from "@/lib/sync";
import { getCurrentSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

function readBlobKey(request: NextRequest): SyncBlobKey | null {
  const raw = request.nextUrl.searchParams.get("blob");
  return isSyncBlobKey(raw) ? raw : null;
}

/** Pro users only; sync is the headline paid feature. */
async function resolveProUser(request: NextRequest): Promise<{ userId: string } | NextResponse> {
  const db = getDb();
  if (!db) return jsonError(503, "Cloud sync is not configured yet.", { configured: false });
  const current = await getCurrentSession(request, db);
  if (!current) return jsonError(401, "Sign in required.");
  const plan = await getPlanForUser(db, current.user.id);
  if (plan !== "pro") {
    return jsonError(403, "Cloud sync is a Pro feature.", { plan });
  }
  return { userId: current.user.id };
}

export async function GET(request: NextRequest) {
  const blobKey = readBlobKey(request);
  if (!blobKey) return jsonError(400, "A valid blob key is required.");

  const resolved = await resolveProUser(request);
  if (resolved instanceof NextResponse) return resolved;

  const db = getDb() as D1Database;
  const blob = await getSyncBlob(db, resolved.userId, blobKey);
  return NextResponse.json(blob ?? { revision: 0, json: null, updated_at: null });
}

export async function PUT(request: NextRequest) {
  const blobKey = readBlobKey(request);
  if (!blobKey) return jsonError(400, "A valid blob key is required.");

  const resolved = await resolveProUser(request);
  if (resolved instanceof NextResponse) return resolved;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }
  const payload = body as { json?: unknown; revision?: unknown };
  if (typeof payload.json !== "string" || payload.json.length === 0) {
    return jsonError(400, "Blob json is required.");
  }
  if (Buffer.byteLength(payload.json, "utf8") > MAX_SYNC_BLOB_BYTES) {
    return jsonError(413, "Blob is too large.");
  }
  if (
    typeof payload.revision !== "number" ||
    !Number.isInteger(payload.revision) ||
    payload.revision < 1
  ) {
    return jsonError(400, "A positive integer revision is required.");
  }

  const db = getDb() as D1Database;
  const result = await putSyncBlob(db, resolved.userId, blobKey, payload.json, payload.revision);
  return NextResponse.json({ ok: true, ...result });
}
