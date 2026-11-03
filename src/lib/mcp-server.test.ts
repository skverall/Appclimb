import { describe, expect, it, vi } from "vitest";

import { AGENT_TOOLS, type AgentToolContext } from "@/lib/agent-tools";
import {
  JSON_RPC,
  LATEST_LEGACY_VERSION,
  LEGACY_PROTOCOL_VERSIONS,
  MCP_PROTOCOL_VERSIONS,
  MODERN_PROTOCOL_VERSIONS,
  SERVER_INFO,
  SERVER_INSTRUCTIONS,
  decodeHeaderValue,
  isJsonRpcRequest,
  needsResponse,
  negotiateProtocolVersion,
  processMcpMessage,
  rpcError,
  type JsonRpcRequest,
} from "@/lib/mcp-server";

const MODERN = MODERN_PROTOCOL_VERSIONS[0];
const META_KEY = "io.modelcontextprotocol/protocolVersion";

const context: AgentToolContext = {
  userId: "user-1",
  plan: "free",
  db: {} as D1Database,
  data: null,
  itunesFetch: null,
  origin: "https://appclimb.app",
};

function contextSpy() {
  return vi.fn(async () => context);
}

/** Case-insensitive header lookup, like `Headers.get`. */
function headers(values: Record<string, string> = {}) {
  const lower = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  return (name: string) => lower.get(name.toLowerCase()) ?? null;
}

function legacy(method: string, params?: Record<string, unknown>, id: JsonRpcRequest["id"] = 1): JsonRpcRequest {
  return { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) };
}

function modern(method: string, params: Record<string, unknown> = {}, version: string = MODERN, id: JsonRpcRequest["id"] = 7) {
  return { jsonrpc: "2.0" as const, id, method, params: { ...params, _meta: { [META_KEY]: version } } };
}

function modernHeaders(method: string, extra: Record<string, string> = {}) {
  return headers({ "MCP-Protocol-Version": MODERN, "Mcp-Method": method, ...extra });
}

function base64(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

describe("JSON-RPC helpers", () => {
  it("recognizes requests", () => {
    expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping" })).toBe(true);
    expect(isJsonRpcRequest(null)).toBe(false);
    expect(isJsonRpcRequest("ping")).toBe(false);
    expect(isJsonRpcRequest([{ jsonrpc: "2.0", method: "ping" }])).toBe(false);
    expect(isJsonRpcRequest({ jsonrpc: "1.0", method: "ping" })).toBe(false);
    expect(isJsonRpcRequest({ jsonrpc: "2.0", method: 5 })).toBe(false);
  });

  it("answers requests with an id but not notifications", () => {
    expect(needsResponse(legacy("ping", undefined, 0))).toBe(true);
    expect(needsResponse(legacy("ping", undefined, "abc"))).toBe(true);
    expect(needsResponse({ jsonrpc: "2.0", method: "ping" })).toBe(false);
    expect(needsResponse(legacy("ping", undefined, null))).toBe(false);
    expect(needsResponse(legacy("notifications/initialized"))).toBe(false);
  });

  it("negotiates among legacy versions", () => {
    expect([...MCP_PROTOCOL_VERSIONS]).toEqual([...MODERN_PROTOCOL_VERSIONS, ...LEGACY_PROTOCOL_VERSIONS]);
    expect(negotiateProtocolVersion("2024-11-05")).toBe("2024-11-05");
    expect(negotiateProtocolVersion("2025-06-18")).toBe("2025-06-18");
    expect(negotiateProtocolVersion(MODERN)).toBe(LATEST_LEGACY_VERSION);
    expect(negotiateProtocolVersion("1999-01-01")).toBe(LATEST_LEGACY_VERSION);
    expect(negotiateProtocolVersion(undefined)).toBe("2025-11-25");
  });

  it("decodes base64-sentinel header values", () => {
    expect(decodeHeaderValue("analyze_keywords")).toBe("analyze_keywords");
    expect(decodeHeaderValue(`=?base64?${base64("analyze_keywords")}?=`)).toBe("analyze_keywords");
    expect(decodeHeaderValue(`=?base64?${base64("café ☕")}?=`)).toBe("café ☕");
    expect(decodeHeaderValue("=?base64?***?=")).toBe("");
  });

  it("builds errors with optional data", () => {
    expect(rpcError(1, JSON_RPC.methodNotFound, "nope")).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "nope" },
    });
    expect(rpcError(null, JSON_RPC.unsupportedProtocolVersion, "bad", { a: 1 })).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32022, message: "bad", data: { a: 1 } },
    });
  });
});

describe("messages that are not requests", () => {
  it("accepts client responses and notifications without a reply", async () => {
    for (const message of [
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: 1, error: { code: 1, message: "x" } },
      { jsonrpc: "2.0" },
    ]) {
      expect(await processMcpMessage(message, headers(), contextSpy())).toEqual({ status: 202, body: null });
    }
  });

  it("rejects malformed requests", async () => {
    for (const message of [null, "ping", 42, { jsonrpc: "2.0", id: 3, method: 5 }]) {
      expect(await processMcpMessage(message, headers(), contextSpy())).toEqual({
        status: 400,
        body: rpcError(null, JSON_RPC.invalidRequest, "Invalid request."),
      });
    }
  });
});

describe("legacy era (initialize handshake)", () => {
  it("negotiates the protocol version on initialize", async () => {
    const getContext = contextSpy();
    const reply = await processMcpMessage(legacy("initialize", { protocolVersion: "2025-06-18" }), headers(), getContext);
    expect(reply).toEqual({
      status: 200,
      body: {
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: SERVER_INSTRUCTIONS,
        },
      },
    });
    expect(getContext).not.toHaveBeenCalled();

    for (const params of [{ protocolVersion: "2099-01-01" }, { protocolVersion: MODERN }, undefined]) {
      const fallback = await processMcpMessage(legacy("initialize", params), headers(), contextSpy());
      expect(fallback.body?.result).toMatchObject({ protocolVersion: LATEST_LEGACY_VERSION });
    }
    const odd = await processMcpMessage(
      { jsonrpc: "2.0", id: 2, method: "initialize", params: "x" as never },
      headers(),
      contextSpy(),
    );
    expect(odd.body?.result).toMatchObject({ protocolVersion: LATEST_LEGACY_VERSION });
  });

  it("answers ping and the empty resource and prompt lists", async () => {
    const answer = async (method: string) =>
      (await processMcpMessage(legacy(method), headers({ "MCP-Protocol-Version": "2025-06-18" }), contextSpy())).body;
    expect(await answer("ping")).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    expect((await answer("resources/list"))?.result).toEqual({ resources: [] });
    expect((await answer("resources/templates/list"))?.result).toEqual({ resourceTemplates: [] });
    expect((await answer("prompts/list"))?.result).toEqual({ prompts: [] });
  });

  it("lists every tool with its schema and read-only annotations", async () => {
    const reply = await processMcpMessage(legacy("tools/list"), headers(), contextSpy());
    const tools = (reply.body?.result as { tools: Array<Record<string, unknown>> }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(AGENT_TOOLS.map((tool) => tool.name));
    expect(tools).toHaveLength(10);
    for (const tool of tools) {
      expect(Object.keys(tool).sort()).toEqual(["annotations", "description", "inputSchema", "name", "title"]);
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, title: tool.title });
    }
    const analyze = tools.find((tool) => tool.name === "analyze_keywords");
    expect(analyze?.annotations).toMatchObject({ idempotentHint: false, openWorldHint: true });
    const popularity = tools.find((tool) => tool.name === "get_keyword_popularity");
    expect(popularity?.annotations).toMatchObject({ idempotentHint: true, openWorldHint: false });
  });

  it("calls a tool and returns text plus structured content", async () => {
    const getContext = contextSpy();
    const reply = await processMcpMessage(
      legacy("tools/call", { name: "build_keyword_field", arguments: { keywords: ["habit", "streak"] } }),
      headers(),
      getContext,
    );
    expect(reply.status).toBe(200);
    const result = reply.body?.result as {
      content: Array<{ type: string; text: string }>;
      structuredContent: Record<string, unknown>;
      isError: boolean;
    };
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ keyword_field: "habit,streak" });
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify(result.structuredContent) }]);
    expect(getContext).toHaveBeenCalledTimes(1);
  });

  it("reports tool failures as isError results", async () => {
    const reply = await processMcpMessage(legacy("tools/call", { name: "build_keyword_field" }), headers(), contextSpy());
    expect(reply.body?.result).toMatchObject({ isError: true, structuredContent: { error: "Pass at least one keyword." } });
  });

  it("rejects unknown tools with invalid params, before loading context", async () => {
    const getContext = contextSpy();
    expect(await processMcpMessage(legacy("tools/call", { name: "drop_tables" }), headers(), getContext)).toEqual({
      status: 200,
      body: rpcError(1, JSON_RPC.invalidParams, "Unknown tool: drop_tables"),
    });
    const unnamed = await processMcpMessage(legacy("tools/call", {}), headers(), getContext);
    expect(unnamed.body?.error).toEqual({ code: -32602, message: "Unknown tool: (none)" });
    expect(getContext).not.toHaveBeenCalled();
  });

  it("answers unknown methods with method-not-found in a 200", async () => {
    expect(await processMcpMessage(legacy("sampling/createMessage"), headers(), contextSpy())).toEqual({
      status: 200,
      body: rpcError(1, JSON_RPC.methodNotFound, "Method not found: sampling/createMessage"),
    });
  });

  it("does not reply to notifications", async () => {
    for (const message of [
      { jsonrpc: "2.0" as const, method: "notifications/initialized" },
      legacy("notifications/cancelled", { requestId: 1 }),
      legacy("ping", undefined, null),
    ]) {
      expect(await processMcpMessage(message, headers(), contextSpy())).toEqual({ status: 202, body: null });
    }
  });

  it("rejects a modern header without _meta and unknown header versions", async () => {
    const modernHeader = await processMcpMessage(legacy("tools/list"), headers({ "MCP-Protocol-Version": MODERN }), contextSpy());
    expect(modernHeader.status).toBe(400);
    expect(modernHeader.body?.error?.code).toBe(JSON_RPC.headerMismatch);
    expect(modernHeader.body?.error?.message).toContain(META_KEY);
    const modernNotification = await processMcpMessage(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      headers({ "MCP-Protocol-Version": MODERN }),
      contextSpy(),
    );
    expect(modernNotification.status).toBe(400);
    expect(modernNotification.body?.id).toBeNull();

    const unknown = await processMcpMessage(
      { jsonrpc: "2.0", method: "tools/list", params: { _meta: "nope" } },
      headers({ "MCP-Protocol-Version": "1999-01-01" }),
      contextSpy(),
    );
    expect(unknown).toEqual({
      status: 400,
      body: rpcError(null, JSON_RPC.invalidRequest, "Unsupported MCP-Protocol-Version: 1999-01-01"),
    });
  });
});

describe("modern era (2026-07-28, per-request _meta)", () => {
  it("serves server/discover with caching hints", async () => {
    const reply = await processMcpMessage(modern("server/discover"), modernHeaders("server/discover"), contextSpy());
    expect(reply).toEqual({
      status: 200,
      body: {
        jsonrpc: "2.0",
        id: 7,
        result: {
          resultType: "complete",
          supportedVersions: MCP_PROTOCOL_VERSIONS,
          capabilities: { tools: { listChanged: false } },
          _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
          instructions: SERVER_INSTRUCTIONS,
          ttlMs: 3_600_000,
          cacheScope: "public",
        },
      },
    });
  });

  it("answers ping and tools/list with resultType complete", async () => {
    const ping = await processMcpMessage(modern("ping"), modernHeaders("ping"), contextSpy());
    expect(ping.body?.result).toEqual({ resultType: "complete" });
    const list = await processMcpMessage(modern("tools/list"), modernHeaders("tools/list"), contextSpy());
    expect(list.body?.result).toMatchObject({ resultType: "complete", ttlMs: 3_600_000, cacheScope: "public" });
    expect((list.body?.result as { tools: unknown[] }).tools).toHaveLength(AGENT_TOOLS.length);
  });

  it("calls a tool when Mcp-Name matches, plain or base64-encoded", async () => {
    const message = modern("tools/call", { name: "build_keyword_field", arguments: { keywords: ["habit"] } });
    for (const name of ["build_keyword_field", `=?base64?${base64("build_keyword_field")}?=`]) {
      const reply = await processMcpMessage(message, modernHeaders("tools/call", { "Mcp-Name": name }), contextSpy());
      expect(reply.status).toBe(200);
      expect(reply.body?.result).toMatchObject({
        resultType: "complete",
        isError: false,
        structuredContent: { keyword_field: "habit" },
      });
    }
  });

  it("rejects unknown tools with invalid params", async () => {
    const reply = await processMcpMessage(
      modern("tools/call", { name: "drop_tables" }),
      modernHeaders("tools/call", { "Mcp-Name": "drop_tables" }),
      contextSpy(),
    );
    expect(reply).toEqual({ status: 200, body: rpcError(7, JSON_RPC.invalidParams, "Unknown tool: drop_tables") });
    const unnamed = await processMcpMessage(modern("tools/call"), modernHeaders("tools/call", { "Mcp-Name": "" }), contextSpy());
    expect(unnamed.body?.error?.message).toBe("Unknown tool: (none)");
  });

  it("requires headers that mirror the body", async () => {
    const call = modern("tools/call", { name: "get_account" });
    const cases: Array<[Record<string, string>, string]> = [
      [{ "Mcp-Method": "tools/call", "Mcp-Name": "get_account" }, `MCP-Protocol-Version must be '${MODERN}'`],
      [{ "MCP-Protocol-Version": "2025-06-18", "Mcp-Method": "tools/call", "Mcp-Name": "get_account" }, "MCP-Protocol-Version"],
      [{ "MCP-Protocol-Version": MODERN, "Mcp-Name": "get_account" }, "Mcp-Method must be 'tools/call'"],
      [{ "MCP-Protocol-Version": MODERN, "Mcp-Method": "tools/list", "Mcp-Name": "get_account" }, "Mcp-Method"],
      [{ "MCP-Protocol-Version": MODERN, "Mcp-Method": "tools/call" }, "Mcp-Name must be 'get_account'"],
      [{ "MCP-Protocol-Version": MODERN, "Mcp-Method": "tools/call", "Mcp-Name": "analyze_keywords" }, "Mcp-Name"],
    ];
    for (const [values, message] of cases) {
      const getContext = contextSpy();
      const reply = await processMcpMessage(call, headers(values), getContext);
      expect(reply.status).toBe(400);
      expect(reply.body?.error?.code).toBe(JSON_RPC.headerMismatch);
      expect(reply.body?.error?.message).toContain(message);
      expect(getContext).not.toHaveBeenCalled();
    }
  });

  it("checks Mcp-Name against the uri for resources/read and then reports the method as missing", async () => {
    const uri = "appclimb://keywords";
    const read = await processMcpMessage(
      modern("resources/read", { uri }),
      modernHeaders("resources/read", { "Mcp-Name": uri }),
      contextSpy(),
    );
    expect(read).toEqual({ status: 404, body: rpcError(7, JSON_RPC.methodNotFound, "Method not found: resources/read") });
    const prompt = await processMcpMessage(modern("prompts/get"), modernHeaders("prompts/get"), contextSpy());
    expect(prompt.status).toBe(400);
    expect(prompt.body?.error?.message).toBe("Header mismatch: Mcp-Name must be ''");
  });

  it("answers unknown methods with 404, including the legacy handshake", async () => {
    for (const method of ["initialize", "resources/list"]) {
      const reply = await processMcpMessage(modern(method), modernHeaders(method), contextSpy());
      expect(reply).toEqual({ status: 404, body: rpcError(7, JSON_RPC.methodNotFound, `Method not found: ${method}`) });
    }
  });

  it("refuses protocol versions it does not serve", async () => {
    for (const version of ["2027-01-01", "2025-06-18"]) {
      const reply = await processMcpMessage(modern("tools/list", {}, version), modernHeaders("tools/list"), contextSpy());
      expect(reply).toEqual({
        status: 400,
        body: rpcError(7, JSON_RPC.unsupportedProtocolVersion, "Unsupported protocol version", {
          supported: MCP_PROTOCOL_VERSIONS,
          requested: version,
        }),
      });
    }
  });

  it("does not reply to notifications once the headers check out", async () => {
    const notification = { ...modern("notifications/cancelled", { requestId: 3 }), id: undefined };
    expect(await processMcpMessage(notification, modernHeaders("notifications/cancelled"), contextSpy())).toEqual({
      status: 202,
      body: null,
    });
    const badHeaders = await processMcpMessage(notification, modernHeaders("ping"), contextSpy());
    expect(badHeaders.status).toBe(400);
    expect(badHeaders.body?.id).toBeNull();
  });
});
