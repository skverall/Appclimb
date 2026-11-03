import { NextRequest } from "next/server";

import { revokeAgentToken } from "@/lib/agent-auth";
import { agentJson, corsPreflight, readParams } from "@/lib/agent-server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 7009 token revocation. Always 200, even for unknown tokens. */
export async function POST(request: NextRequest) {
  const db = getDb();
  if (db) {
    const params = await readParams(request);
    await revokeAgentToken(db, params.get("token") ?? "");
  }
  return agentJson({});
}

export function OPTIONS() {
  return corsPreflight();
}
