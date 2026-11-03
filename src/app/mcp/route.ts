import { NextRequest, NextResponse } from "next/server";

import { storeToolData } from "@/lib/ai-tools";
import { mcpResourceUrl, verifyAgentToken } from "@/lib/agent-auth";
import { AGENT_CORS_HEADERS, agentJson, bearerToken, corsPreflight } from "@/lib/agent-server";
import type { AgentToolContext } from "@/lib/agent-tools";
import { getDb } from "@/lib/db";
import { getPlanForUser } from "@/lib/entitlement";
import { proxiedItunesFetch, readItunesProxyConfig } from "@/lib/itunes-proxy";
import { JSON_RPC, processMcpMessage, rpcError, type JsonRpcResponse } from "@/lib/mcp-server";
import { createRateLimiter } from "@/lib/rate-limit";
import { searchTermDeps } from "@/lib/search-terms-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_BATCH = 20;
const limiter = createRateLimiter({ maxPerWindow: 120, windowMs: 60_000 });

function unauthorized(request: NextRequest, hadToken: boolean): NextResponse {
  const origin = request.nextUrl.origin;
  const challenge = [
    `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
    `scope="appclimb"`,
    ...(hadToken ? [`error="invalid_token"`, `error_description="The access token is invalid or expired."`] : []),
  ].join(", ");
  return agentJson(
    { error: "unauthorized", error_description: `Connect AppClimb first: ${origin}/connect` },
    { status: 401, headers: { "WWW-Authenticate": challenge } },
  );
}

/**
 * Remote MCP endpoint (Streamable HTTP, stateless, JSON responses). Every
 * request needs an OAuth access token or an AppClimb API key.
 */
export async function POST(request: NextRequest) {
  const db = getDb();
  if (!db) return agentJson(rpcError(null, JSON_RPC.internalError, "AppClimb accounts are not configured."), { status: 503 });

  const token = bearerToken(request);
  const principal = token ? await verifyAgentToken(db, token, mcpResourceUrl(request.nextUrl.origin)) : null;
  if (!principal) return unauthorized(request, Boolean(token));

  const rate = limiter.consume(`user:${principal.userId}`);
  if (!rate.ok) {
    return agentJson(rpcError(null, JSON_RPC.internalError, "Too many requests. Slow down a little."), {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSec ?? 5) },
    });
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return agentJson(rpcError(null, JSON_RPC.invalidRequest, "Request body too large."), { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return agentJson(rpcError(null, JSON_RPC.parseError, "Parse error."), { status: 400 });
  }

  let context: Promise<AgentToolContext> | null = null;
  const getContext = () => {
    context ??= (async () => {
      const deps = searchTermDeps();
      const proxy = readItunesProxyConfig();
      return {
        userId: principal.userId,
        plan: await getPlanForUser(db, principal.userId),
        db,
        data: deps ? storeToolData(deps) : null,
        itunesFetch: proxy ? proxiedItunesFetch(proxy) : null,
        origin: request.nextUrl.origin,
      };
    })();
    return context;
  };

  const header = (name: string) => request.headers.get(name);
  const answer = async (message: unknown) => {
    try {
      return await processMcpMessage(message, header, getContext);
    } catch (error) {
      console.error("[mcp] request failed:", error instanceof Error ? error.message : String(error));
      const id = (message as { id?: JsonRpcResponse["id"] } | null)?.id ?? null;
      return { status: 500, body: rpcError(id, JSON_RPC.internalError, "Internal error.") };
    }
  };

  if (Array.isArray(payload)) {
    // JSON-RPC batches existed only in 2025-03-26; answer them for those clients.
    if (payload.length === 0 || payload.length > MAX_BATCH) {
      return agentJson(rpcError(null, JSON_RPC.invalidRequest, "Invalid batch."), { status: 400 });
    }
    const replies = (await Promise.all(payload.map(answer)))
      .map((reply) => reply.body)
      .filter((body): body is JsonRpcResponse => body !== null);
    return replies.length > 0 ? agentJson(replies) : new NextResponse(null, { status: 202, headers: AGENT_CORS_HEADERS });
  }
  const reply = await answer(payload);
  return reply.body
    ? agentJson(reply.body, { status: reply.status })
    : new NextResponse(null, { status: 202, headers: AGENT_CORS_HEADERS });
}

/** No server-to-client stream. A browser visiting /mcp gets the setup page. */
export function GET(request: NextRequest) {
  if ((request.headers.get("accept") ?? "").includes("text/html")) {
    return NextResponse.redirect(new URL("/connect", request.nextUrl.origin));
  }
  return new NextResponse(null, { status: 405, headers: { Allow: "POST", ...AGENT_CORS_HEADERS } });
}

export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST", ...AGENT_CORS_HEADERS } });
}

export function OPTIONS() {
  return corsPreflight();
}
