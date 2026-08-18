import { afterEach, describe, expect, it, vi } from "vitest";

import { anonymousAccount, fetchAccountState } from "./account";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchAccountState", () => {
  it("parses the configured free-tier shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            configured: true,
            user: null,
            plan: "free",
            subscription: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const state = await fetchAccountState();
    expect(state).toMatchObject({ configured: true, plan: "free", user: null });
  });

  it("falls back to the anonymous account when /api/me hangs", async () => {
    // The endpoint never answers; the abort signal from AbortSignal.timeout
    // must cut the request and produce the anonymous shape instead of leaving
    // the header/composer in a permanent loading state.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );

    const promise = fetchAccountState({ timeoutMs: 50 });
    await expect(promise).resolves.toEqual(anonymousAccount());
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit)?.signal).toBeDefined();
  });
});
