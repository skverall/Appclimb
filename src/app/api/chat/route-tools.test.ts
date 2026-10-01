import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { buildDataset } from "@/lib/search-terms";

vi.mock("@/lib/db", () => ({ getDb: () => null }));
vi.mock("@/lib/search-terms-server", () => ({ searchTermDeps: () => ({ db: null, creds: {} }) }));
vi.mock("@/lib/ai-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-tools")>();
  const dataset = buildDataset("US", "2026-09-20", [
    { term: "habit tracker", genre: "PRODUCTIVITY_UTILITIES", popularity: 61 },
  ]);
  return {
    ...actual,
    storeToolData: () => ({
      latest: async () => dataset,
      weeksBefore: async () => null,
      histories: async () => new Map(),
    }),
  };
});

import { POST } from "./route";

function sse(chunks: Array<Record<string, unknown>>): Response {
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const toolCall = {
  choices: [
    {
      delta: {
        content: "Let me check.",
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            function: { name: "lookup_keywords", arguments: '{"terms":["habit ' },
          },
        ],
      },
    },
  ],
};
const toolCallEnd = {
  choices: [
    {
      delta: { tool_calls: [{ index: 0, function: { arguments: 'tracker"]}' } }] },
      finish_reason: "tool_calls",
    },
  ],
};

describe("/api/chat tool loop", () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    vi.unstubAllGlobals();
  });

  it("runs Apple-data tools, streams their card, and answers with the data", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(sse([toolCall, toolCallEnd]))
      .mockResolvedValueOnce(
        sse([{ choices: [{ delta: { content: "**habit tracker** scores 61." }, finish_reason: "stop" }] }]),
      );
    vi.stubGlobal("fetch", fetchImpl);
    const res = await POST(
      new NextRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.2.0.1" },
        body: JSON.stringify({
          message: "how popular is habit tracker?",
          messages: [],
          context: { appName: "Streaks", country: "US", genre: "Productivity" },
          stream: true,
        }),
      }),
    );
    const events = (await res.text())
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string; [key: string]: unknown });

    // The preamble before the tool call is withdrawn.
    expect(events.map((event) => event.type)).toEqual([
      "meta",
      "delta",
      "reset",
      "status",
      "card",
      "status",
      "delta",
      "done",
    ]);
    expect(events[3]).toEqual({ type: "status", text: "Checking Apple popularity for “habit tracker”" });
    expect(events[4]).toMatchObject({
      card: { tool: "lookup_keywords", rows: [{ term: "habit tracker", popularity: 61 }] },
    });
    expect(events[7]).toMatchObject({ message: "**habit tracker** scores 61." });

    // The second round carries the tool call (with its reasoning) and result.
    const first = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body)) as {
      tools: unknown[];
      tool_choice: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(first.tools).toHaveLength(4);
    expect(first.tool_choice).toBe("auto");
    expect(first.messages[0].content).toContain("Streaks");
    const second = JSON.parse(String((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body)) as {
      messages: Array<Record<string, unknown>>;
    };
    const assistant = second.messages[second.messages.length - 2];
    expect(assistant).toMatchObject({
      role: "assistant",
      tool_calls: [{ id: "call_1", function: { name: "lookup_keywords", arguments: '{"terms":["habit tracker"]}' } }],
    });
    const tool = second.messages[second.messages.length - 1];
    expect(tool).toMatchObject({ role: "tool", tool_call_id: "call_1" });
    expect(JSON.parse(String(tool.content)).results[0]).toMatchObject({ popularity: 61 });
  });

  it("makes the model answer once the tool rounds run out", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { tool_choice: string };
      return body.tool_choice === "none"
        ? sse([{ choices: [{ delta: { content: "Here is what I found." }, finish_reason: "stop" }] }])
        : sse([toolCall, toolCallEnd]);
    });
    vi.stubGlobal("fetch", fetchImpl);
    const res = await POST(
      new NextRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.2.0.2" },
        body: JSON.stringify({ message: "dig forever", messages: [], context: null }),
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      message: "Here is what I found.",
      cards: [{ tool: "lookup_keywords" }, { tool: "lookup_keywords" }, { tool: "lookup_keywords" }],
    });
    // Three tool rounds, then the forced answer.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
