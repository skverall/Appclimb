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
