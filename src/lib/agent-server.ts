/**
 * Server-only HTTP helpers shared by the MCP endpoint and the OAuth routes
 * (ADR 0008): CORS for browser-based MCP clients, OAuth error bodies, and
 * reading form or JSON request bodies.
 */
import { NextResponse } from "next/server";

/** Browser-based clients (MCP Inspector, web IDEs) call these endpoints cross-origin. */
export const AGENT_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: AGENT_CORS_HEADERS });
}

export function agentJson(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { "Cache-Control": "no-store", ...AGENT_CORS_HEADERS, ...init.headers },
  });
}

export function oauthError(error: string, description: string, status = 400): NextResponse {
  return agentJson({ error, error_description: description }, { status });
}

/** OAuth token and revocation requests are form-encoded; accept JSON too. */
export async function readParams(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body ?? {})) {
        if (typeof value === "string") params.set(key, value);
      }
      return params;
    }
    return new URLSearchParams(await request.text());
  } catch {
    return new URLSearchParams();
  }
}

/** Public clients authenticate with no secret; tolerate HTTP Basic with an empty password. */
export function clientIdFrom(request: Request, params: URLSearchParams): string {
  const fromBody = params.get("client_id");
  if (fromBody) return fromBody;
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("basic ")) return "";
  try {
    const decoded = atob(header.slice(6).trim());
    return decodeURIComponent(decoded.split(":")[0] ?? "");
  } catch {
    return "";
  }
}

export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}
