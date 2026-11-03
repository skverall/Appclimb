/**
 * A small, stateless, dual-era MCP server for the /mcp route (ADR 0008).
 *
 * Modern clients (revision 2026-07-28: no handshake, version and identity in
 * each request's `_meta`, mirrored into HTTP headers) and legacy clients
 * (2025-11-25 and earlier: an `initialize` handshake first) share one
 * endpoint. Either way there are no sessions and no server-to-client stream,
 * which suits a Worker: any isolate can answer any request. Only the `tools`
 * capability is offered, and every answer is a single JSON response.
 */
import { AGENT_TOOLS, isAgentTool, runAgentTool, type AgentToolContext } from "./agent-tools";

export const MODERN_PROTOCOL_VERSIONS = ["2026-07-28"] as const;
export const LEGACY_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const MCP_PROTOCOL_VERSIONS: readonly string[] = [...MODERN_PROTOCOL_VERSIONS, ...LEGACY_PROTOCOL_VERSIONS];
export const LATEST_LEGACY_VERSION = LEGACY_PROTOCOL_VERSIONS[0];
const META_VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
/** Tools and server identity change only on deploy; clients may cache them for an hour. */
const LIST_TTL_MS = 60 * 60 * 1000;

export const SERVER_INFO = {
  name: "appclimb",
  title: "AppClimb",
  version: "1.0.0",
  websiteUrl: "https://appclimb.app/connect",
  icons: [
    { src: "https://appclimb.app/icons/v2/icon-512.png", mimeType: "image/png", sizes: ["512x512"] },
    { src: "https://appclimb.app/icons/v2/icon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
  ],
};

export const SERVER_INSTRUCTIONS = [
  "AppClimb finds App Store keywords an iOS app can actually rank for.",
  "Typical flow: search_apps to get the app ID -> get_app_keyword_ideas and find_related_keywords for candidates -> analyze_keywords (with app_id) for difficulty, verdict and current rank -> build_keyword_field for the 100-character keyword field.",
  "Popularity is Apple's relative 1-100 score from Apple Ads, never search volume; long-tail terms only have a ceiling ('at most N'). Difficulty is an estimate with evidence. Do not invent numbers.",
  "analyze_keywords, check_app_rankings and get_app_keyword_ideas use the user's daily App Store checks (get_account shows what is left); the Apple popularity tools are free.",
].join("\n");

const CAPABILITIES = { tools: { listChanged: false } };

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const JSON_RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  headerMismatch: -32020,
  unsupportedProtocolVersion: -32022,
} as const;

/** What the route sends back: an HTTP status and a JSON-RPC body (null means 202, no body). */
export interface McpReply {
  status: number;
  body: JsonRpcResponse | null;
}

export function rpcError(
  id: JsonRpcResponse["id"],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return message.jsonrpc === "2.0" && typeof message.method === "string";
}

/** Notifications carry no id and get no reply. */
export function needsResponse(message: JsonRpcRequest): boolean {
  return message.id !== undefined && message.id !== null && !message.method.startsWith("notifications/");
}

export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === "string" && (LEGACY_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : LATEST_LEGACY_VERSION;
}

/** Undo the `=?base64?…?=` sentinel clients use for non-ASCII header values. */
export function decodeHeaderValue(value: string): string {
  const match = /^=\?base64\?(.*)\?=$/u.exec(value);
  if (!match) return value;
  try {
    const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function listTools() {
  return AGENT_TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  }));
}

async function callTool(
  params: Record<string, unknown>,
  getContext: () => Promise<AgentToolContext>,
): Promise<Record<string, unknown> | null> {
  const name = typeof params.name === "string" ? params.name : "";
  if (!isAgentTool(name)) return null;
  const outcome = await runAgentTool(await getContext(), name, params.arguments ?? {});
  return {
    content: [{ type: "text", text: JSON.stringify(outcome.structured) }],
    structuredContent: outcome.structured,
    isError: outcome.isError === true,
  };
}

function ok(id: JsonRpcResponse["id"], result: unknown): McpReply {
  return { status: 200, body: { jsonrpc: "2.0", id, result } };
}

async function handleLegacy(
  message: JsonRpcRequest,
  params: Record<string, unknown>,
  getContext: () => Promise<AgentToolContext>,
): Promise<McpReply> {
  const id = message.id ?? null;
  switch (message.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: negotiateProtocolVersion(params.protocolVersion),
        capabilities: CAPABILITIES,
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: listTools() });
    case "tools/call": {
      const result = await callTool(params, getContext);
      if (!result) return { status: 200, body: rpcError(id, JSON_RPC.invalidParams, `Unknown tool: ${String(params.name ?? "(none)")}`) };
      return ok(id, result);
    }
    case "resources/list":
      return ok(id, { resources: [] });
    case "resources/templates/list":
      return ok(id, { resourceTemplates: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      return { status: 200, body: rpcError(id, JSON_RPC.methodNotFound, `Method not found: ${message.method}`) };
  }
}

function headerMismatch(id: JsonRpcResponse["id"], detail: string): McpReply {
  return { status: 400, body: rpcError(id, JSON_RPC.headerMismatch, `Header mismatch: ${detail}`) };
}

async function handleModern(
  message: JsonRpcRequest,
  params: Record<string, unknown>,
  version: string,
  header: (name: string) => string | null,
  getContext: () => Promise<AgentToolContext>,
): Promise<McpReply> {
  const id = message.id ?? null;
  if (!(MODERN_PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
    return {
      status: 400,
      body: rpcError(id, JSON_RPC.unsupportedProtocolVersion, "Unsupported protocol version", {
        supported: MCP_PROTOCOL_VERSIONS,
        requested: version,
      }),
    };
  }
  if (header("mcp-protocol-version") !== version) {
    return headerMismatch(id, `MCP-Protocol-Version must be '${version}'`);
  }
  if (header("mcp-method") !== message.method) {
    return headerMismatch(id, `Mcp-Method must be '${message.method}'`);
  }
  if (["tools/call", "resources/read", "prompts/get"].includes(message.method)) {
    const source = typeof params.name === "string" ? params.name : typeof params.uri === "string" ? params.uri : "";
    const named = header("mcp-name");
    if (named === null || decodeHeaderValue(named) !== source) {
      return headerMismatch(id, `Mcp-Name must be '${source}'`);
    }
  }
  if (!needsResponse(message)) return { status: 202, body: null };

  switch (message.method) {
    case "server/discover":
      return ok(id, {
        resultType: "complete",
        supportedVersions: MCP_PROTOCOL_VERSIONS,
        capabilities: CAPABILITIES,
        _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
        instructions: SERVER_INSTRUCTIONS,
        ttlMs: LIST_TTL_MS,
        cacheScope: "public",
      });
    case "ping":
      return ok(id, { resultType: "complete" });
    case "tools/list":
      return ok(id, { resultType: "complete", tools: listTools(), ttlMs: LIST_TTL_MS, cacheScope: "public" });
    case "tools/call": {
      const result = await callTool(params, getContext);
      if (!result) return { status: 200, body: rpcError(id, JSON_RPC.invalidParams, `Unknown tool: ${String(params.name ?? "(none)")}`) };
      return ok(id, { resultType: "complete", ...result });
    }
    default:
      return { status: 404, body: rpcError(id, JSON_RPC.methodNotFound, `Method not found: ${message.method}`) };
  }
}

/**
 * Answer one JSON-RPC message from a POST body. A request whose `_meta`
 * names a protocol version is served under the modern rules; anything else
 * (an `initialize` handshake and what follows it) under the legacy ones.
 * `getContext` is called only for tool calls, so discovery stays cheap.
 */
export async function processMcpMessage(
  message: unknown,
  header: (name: string) => string | null,
  getContext: () => Promise<AgentToolContext>,
): Promise<McpReply> {
  if (!isJsonRpcRequest(message)) {
    const value = message && typeof message === "object" ? (message as Record<string, unknown>) : null;
    // Client responses and notifications need no reply; a malformed request does.
    if (value && ("result" in value || "error" in value || value.id === undefined)) return { status: 202, body: null };
    return { status: 400, body: rpcError(null, JSON_RPC.invalidRequest, "Invalid request.") };
  }
  const params = message.params && typeof message.params === "object" ? message.params : {};
  const meta = params._meta && typeof params._meta === "object" ? (params._meta as Record<string, unknown>) : {};
  const modernVersion = meta[META_VERSION_KEY];
  if (typeof modernVersion === "string") {
    return handleModern(message, params, modernVersion, header, getContext);
  }

  const headerVersion = header("mcp-protocol-version");
  if (headerVersion && !(LEGACY_PROTOCOL_VERSIONS as readonly string[]).includes(headerVersion)) {
    if ((MODERN_PROTOCOL_VERSIONS as readonly string[]).includes(headerVersion)) {
      return headerMismatch(message.id ?? null, `_meta['${META_VERSION_KEY}'] is required with MCP-Protocol-Version ${headerVersion}`);
    }
    return {
      status: 400,
      body: rpcError(message.id ?? null, JSON_RPC.invalidRequest, `Unsupported MCP-Protocol-Version: ${headerVersion}`),
    };
  }
  if (!needsResponse(message)) return { status: 202, body: null };
  return handleLegacy(message, params, getContext);
}
