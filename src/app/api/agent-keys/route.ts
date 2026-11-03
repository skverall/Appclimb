import { NextRequest, NextResponse } from "next/server";

import { createApiKey, listAgentGrants, mcpResourceUrl, revokeAgentGrant } from "@/lib/agent-auth";
import { readAgentUsage, agentDailyChecks } from "@/lib/agent-usage";
import { getDb } from "@/lib/db";
import { getPlanForUser } from "@/lib/entitlement";
import { getCurrentSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function signedIn(request: NextRequest) {
  const db = getDb();
  if (!db) return { error: NextResponse.json({ error: "Accounts are not configured." }, { status: 503 }) };
  const current = await getCurrentSession(request, db);
  if (!current) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  return { db, userId: current.user.id };
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

/** Connected AI apps and API keys, plus today's agent checks. */
export async function GET(request: NextRequest) {
  const auth = await signedIn(request);
  if ("error" in auth) return auth.error;
  const plan = await getPlanForUser(auth.db, auth.userId);
  const [grants, used] = await Promise.all([
    listAgentGrants(auth.db, auth.userId),
    readAgentUsage(auth.db, `user:${auth.userId}`),
  ]);
  return NextResponse.json(
    { grants, usage: { used, limit: agentDailyChecks(plan) }, plan },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Create a personal API key. The key is shown once and only its hash is kept. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const auth = await signedIn(request);
  if ("error" in auth) return auth.error;
  let body: { label?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const result = await createApiKey(auth.db, auth.userId, body.label, mcpResourceUrl(request.nextUrl.origin));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ key: result.key, grant: result.grant }, { status: 201 });
}

/** Disconnect an AI app or revoke an API key: DELETE /api/agent-keys?id=… */
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const auth = await signedIn(request);
  if ("error" in auth) return auth.error;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const ok = await revokeAgentGrant(auth.db, auth.userId, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found." }, { status: 404 });
}
