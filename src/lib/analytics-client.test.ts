import { beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_OPTOUT_KEY, trackAppEvent } from "./analytics-client";

/**
 * Minimal browser stubs: the module is written for real browsers, but the
 * suite runs in node. Each test installs fresh window/localStorage/navigator
 * doubles and inspects what the tracker sent.
 */
function installBrowserStubs() {
  const store = new Map<string, string>();
  const sent: Array<{ url: string; payload: string }> = [];

  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => void store.clear(),
  };

  const navigator = {
    sendBeacon: vi.fn((url: string, blob: { payload?: string }) => {
      sent.push({ url, payload: blob.payload ?? "" });
      return true;
    }),
  };

  vi.stubGlobal("window", {
    localStorage,
    location: { pathname: "/" },
    innerWidth: 1440,
  });
  vi.stubGlobal("navigator", navigator);
  vi.stubGlobal("Blob", class {
    payload: string;
    constructor(parts: string[]) {
      this.payload = parts[0] ?? "";
    }
  });
  // sendBeacon receives the Blob we constructed; capture its serialized text.
  (navigator.sendBeacon as ReturnType<typeof vi.fn>).mockImplementation(
    (url: string, blob: { payload?: string }) => {
      sent.push({ url, payload: blob?.payload ?? "" });
      return true;
    },
  );

  return { store, sent };
}

describe("trackAppEvent (client product events)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an event payload to the track endpoint", () => {
    const { sent } = installBrowserStubs();

    trackAppEvent("signup_intent_shown", { intent: "track" });

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("/api/analytics/track");
    const body = JSON.parse(sent[0].payload);
    expect(body.name).toBe("signup_intent_shown");
    expect(body.meta).toEqual({ intent: "track" });
    expect(body.path).toBe("/");
    expect(body.screenWidth).toBe(1440);
  });

  it("dedupes oncePerDay scopes within the same day", () => {
    const { sent } = installBrowserStubs();

    trackAppEvent("signup_intent_shown", { intent: "track" }, { oncePerDay: "track" });
    trackAppEvent("signup_intent_shown", { intent: "track" }, { oncePerDay: "track" });

    expect(sent).toHaveLength(1);
  });

  it("sends different oncePerDay scopes independently", () => {
    const { sent } = installBrowserStubs();

    trackAppEvent("signup_intent_shown", { intent: "track" }, { oncePerDay: "track" });
    trackAppEvent("signup_intent_shown", { intent: "assistant" }, { oncePerDay: "assistant" });

    expect(sent).toHaveLength(2);
  });

  it("dedupes onceEver scopes across calls", () => {
    const { sent } = installBrowserStubs();

    trackAppEvent("keyword_analyzed_first", null, { onceEver: "default" });
    trackAppEvent("keyword_analyzed_first", null, { onceEver: "default" });

    expect(sent).toHaveLength(1);
  });

  it("stays silent for opted-out admins", () => {
    const { sent } = installBrowserStubs();
    window.localStorage.setItem(ADMIN_OPTOUT_KEY, "1");

    trackAppEvent("auth_started", { method: "google" });

    expect(sent).toHaveLength(0);
  });

  it("falls back to fetch when sendBeacon is unavailable", async () => {
    installBrowserStubs();
    const fetchMock = vi.fn().mockResolvedValue({});
    (globalThis.navigator as { sendBeacon?: unknown }).sendBeacon = undefined;
    vi.stubGlobal("fetch", fetchMock);

    trackAppEvent("auth_completed", null, { onceEver: "default" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analytics/track",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
  });
});
