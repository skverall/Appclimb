import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ getDb: () => null }));

let ipCounter = 0;

import { POST } from "./route";

describe("/api/chat upstream handling", () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    vi.unstubAllGlobals();
  });

  const makeRequest = () => {
    ipCounter += 1;
    return new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.0.0.${ipCounter}`,
      },
      body: JSON.stringify({ message: "hello", messages: [], context: null }),
    });
  };

  it("returns 503 when the assistant key is unset", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
  });

  it("returns 502 when the upstream fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: /Could not reach the assistant model/i,
    });
  });

  it("maps an upstream 429 to a 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
  });

  it("maps an upstream 401/403 to a 503", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
  });

  it("returns 502 on a non-JSON upstream body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>", { status: 200 })));
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
  });

  it("returns 502 on an empty assistant response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
          status: 200,
        }),
      ),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
  });

  it("returns the assistant message on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), {
          status: 200,
        }),
      ),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ message: "hi" });
  });
});

describe("/api/chat hourly quota (429)", () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns 429 once the hourly cap is exhausted", async () => {
    const fixedIpRequest = () =>
      new NextRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.9.9.9" },
        body: JSON.stringify({ message: "hello", messages: [], context: null }),
      });
    let now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "x" } }] }), {
            status: 200,
          }),
      ),
    );

    // The hourly cap is 20/IP; each request is spaced past the 1200ms interval.
    for (let i = 0; i < 20; i += 1) {
      now += 1201;
      const res = await POST(fixedIpRequest());
      expect(res.status, `request #${i + 1} should pass`).toBe(200);
    }
    now += 1201;
    const blocked = await POST(fixedIpRequest());
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({ error: /limit/i });
  });
});

function sse(chunks: Array<Record<string, unknown>>): Response {
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

async function readEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("/api/chat streaming", () => {
  let ip = 200;
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    vi.unstubAllGlobals();
  });

  const streamRequest = (message = "hello", messages: unknown[] = []) => {
    ip += 1;
    return new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.1.0.${ip}` },
      body: JSON.stringify({ message, messages, context: null, stream: true }),
    });
  };

  it("streams deltas and a final message with follow-ups split off", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sse([
          { choices: [{ delta: { reasoning_content: "hmm" } }] },
          { choices: [{ delta: { content: "Use **habit tracker**." } }] },
          { choices: [{ delta: { content: "\n```followups\n- Write my subtitle\n```" }, finish_reason: "stop" }] },
        ]),
      ),
    );
    const res = await POST(streamRequest());
    expect(res.headers.get("content-type")).toContain("ndjson");
    const events = await readEvents(res);
    expect(events[0]).toMatchObject({ type: "meta", model: "deepseek-v4-flash" });
    expect(events).toContainEqual({ type: "status", text: "Thinking" });
    expect(events.filter((event) => event.type === "delta")).toHaveLength(2);
    expect(events[events.length - 1]).toEqual({
      type: "done",
      message: "Use **habit tracker**.",
      followups: ["Write my subtitle"],
    });
  });

  it("drops only the trailing copy of the new message from history", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: "again" } }] }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    await (await POST(
      streamRequest("same question", [
        { role: "user", content: "same question" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "same question" },
      ]),
    )).text();
    const sent = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as {
      messages: Array<{ role: string; content: string }>;
      stream: boolean;
    };
    expect(sent.stream).toBe(true);
    expect(sent.messages.slice(1)).toEqual([
      { role: "user", content: "same question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "same question" },
    ]);
  });

  it("retries once when the model writes nothing, then reports the failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () =>
      sse([{ choices: [{ delta: { reasoning_content: "long thought" }, finish_reason: "length" }] }]),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const events = await readEvents(await POST(streamRequest()));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(String((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body)) as {
      max_tokens: number;
    };
    expect(retry.max_tokens).toBeGreaterThan(2_400);
    expect(events[events.length - 1]).toEqual({ type: "error", error: "Empty assistant response." });
    spy.mockRestore();
  });

  it("reports upstream failures inside the stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const events = await readEvents(await POST(streamRequest()));
    expect(events[events.length - 1]).toMatchObject({ type: "error", error: /rate-limiting/i });
  });
});
