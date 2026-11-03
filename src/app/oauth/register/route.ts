import { NextRequest } from "next/server";

import { registerClient } from "@/lib/agent-auth";
import { agentJson, corsPreflight, oauthError } from "@/lib/agent-server";
import { getDb } from "@/lib/db";
import { clientIpFromHeaders, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ maxPerWindow: 20, windowMs: 60 * 60 * 1000 });

/** Dynamic Client Registration (RFC 7591) for MCP clients. */
export async function POST(request: NextRequest) {
  const db = getDb();
  if (!db) return oauthError("temporarily_unavailable", "Accounts are not configured.", 503);
  const ip = clientIpFromHeaders((name) => request.headers.get(name));
  if (!limiter.consume(`ip:${ip}`).ok) {
    return oauthError("temporarily_unavailable", "Too many registrations. Try again later.", 429);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_client_metadata", "Send client metadata as JSON.");
  }
  const result = await registerClient(db, body);
  if (!result.ok) return oauthError(result.error, result.description);
  return agentJson(result.response, { status: 201 });
}

export function OPTIONS() {
  return corsPreflight();
}
