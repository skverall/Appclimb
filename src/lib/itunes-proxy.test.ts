import { afterEach, describe, expect, it, vi } from "vitest";

import { proxiedItunesFetch, readItunesProxyConfig } from "@/lib/itunes-proxy";

const SECRET = "s".repeat(32);
const config = { url: "https://proxy.example.com", secret: SECRET };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("readItunesProxyConfig", () => {
  it("needs an https URL and a secret of 32+ characters", () => {
    vi.stubEnv("ITUNES_PROXY_URL", "");
    vi.stubEnv("ITUNES_PROXY_SECRET", SECRET);
    expect(readItunesProxyConfig()).toBeNull();

    vi.stubEnv("ITUNES_PROXY_URL", "http://proxy.example.com");
    expect(readItunesProxyConfig()).toBeNull();

    vi.stubEnv("ITUNES_PROXY_URL", "https://proxy.example.com");
    vi.stubEnv("ITUNES_PROXY_SECRET", "short");
    expect(readItunesProxyConfig()).toBeNull();
  });

  it("returns null when the variables are unset", () => {
    vi.stubEnv("ITUNES_PROXY_URL", undefined);
    vi.stubEnv("ITUNES_PROXY_SECRET", undefined);
    expect(readItunesProxyConfig()).toBeNull();
  });

  it("trims whitespace and trailing slashes", () => {
    vi.stubEnv("ITUNES_PROXY_URL", "  https://proxy.example.com/itunes//  ");
    vi.stubEnv("ITUNES_PROXY_SECRET", ` ${SECRET} `);
    expect(readItunesProxyConfig()).toEqual({ url: "https://proxy.example.com/itunes", secret: SECRET });
  });
});

describe("proxiedItunesFetch", () => {
  it("rewrites iTunes URLs to the proxy and adds the bearer secret", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ results: [] }));
    const proxied = proxiedItunesFetch(config, fetchImpl);
    const response = await proxied("https://itunes.apple.com/search?term=habit&country=US", {
      method: "GET",
      headers: { accept: "application/json", authorization: "Bearer leaked" },
    });
    expect(await response.json()).toEqual({ results: [] });
    const [target, init] = fetchImpl.mock.calls[0];
    expect(target).toBe("https://proxy.example.com/search?term=habit&country=US");
    expect(init?.method).toBe("GET");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${SECRET}`);
    expect(headers.get("accept")).toBe("application/json");
  });

  it("accepts URL and Request inputs and calls without init", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("ok"));
    const proxied = proxiedItunesFetch(config, fetchImpl);
    await proxied(new URL("https://itunes.apple.com/lookup?id=1"));
    await proxied(new Request("https://itunes.apple.com/lookup?id=2"));
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      "https://proxy.example.com/lookup?id=1",
      "https://proxy.example.com/lookup?id=2",
    ]);
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get("authorization")).toBe(`Bearer ${SECRET}`);
  });

  it("refuses to send anything else through the proxy", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const proxied = proxiedItunesFetch(config, fetchImpl);
    await expect(proxied("https://example.com/search")).rejects.toThrow("itunes_proxy_only");
    await expect(proxied("https://itunes.apple.com.evil.example/search")).rejects.toThrow("itunes_proxy_only");
    await expect(proxied("https://itunes.apple.com")).rejects.toThrow("itunes_proxy_only");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the global fetch by default", async () => {
    const globalFetch = vi.fn<typeof fetch>(async () => new Response("ok"));
    vi.stubGlobal("fetch", globalFetch);
    await proxiedItunesFetch(config)("https://itunes.apple.com/search?term=x");
    expect(globalFetch).toHaveBeenCalledWith("https://proxy.example.com/search?term=x", expect.any(Object));
  });
});
