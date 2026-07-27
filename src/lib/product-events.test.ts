// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  configureProductEvents,
  flushProductEvents,
  PRODUCT_EVENT_NAMES,
  productEventsEnabled,
  trackProductEvent,
} from "@/lib/product-events";

afterEach(() => {
  configureProductEvents({ enabled: false });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  configureProductEvents({ enabled: false });
});

describe("product event emitter", () => {
  it("declares the 21 events the plan lists", () => {
    expect(PRODUCT_EVENT_NAMES).toHaveLength(21);
    expect(PRODUCT_EVENT_NAMES).toContain("insight_opened");
    expect(PRODUCT_EVENT_NAMES).toContain("action_plan_opened");
    expect(PRODUCT_EVENT_NAMES).toContain("recommendation_accepted");
    expect(PRODUCT_EVENT_NAMES).toContain("recommendation_dismissed");
    expect(PRODUCT_EVENT_NAMES).toContain("experiment_created");
  });

  it("sends nothing while disabled, so the demo never writes workspace data", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(productEventsEnabled()).toBe(false);
    trackProductEvent("insight_opened", { insightId: "insight-1" });
    await flushProductEvents();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still notifies local listeners while disabled", () => {
    const listener = vi.fn();
    window.addEventListener("appclimb:product-event", listener);
    trackProductEvent("action_plan_opened", { insightId: "insight-1" });
    window.removeEventListener("appclimb:product-event", listener);

    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.name).toBe("action_plan_opened");
    expect(detail.properties).toEqual({ insightId: "insight-1" });
  });

  it("batches enabled events to the first-party relay", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    configureProductEvents({ enabled: true });

    trackProductEvent("insight_opened", { insightId: "insight-1" });
    trackProductEvent("experiment_created", { experimentId: "exp-1" });
    await flushProductEvents();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/product-events");
    const body = JSON.parse(String(init.body));
    expect(body.events.map((event: { name: string }) => event.name)).toEqual([
      "insight_opened",
      "experiment_created",
    ]);
  });

  it("drops non-primitive properties before they leave the browser", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    configureProductEvents({ enabled: true });

    trackProductEvent("insight_opened", {
      insightId: "insight-1",
      empty: "",
      missing: null,
      undefinedValue: undefined,
      flag: false,
    });
    await flushProductEvents();

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.events[0].properties).toEqual({
      insightId: "insight-1",
      flag: false,
    });
  });

  it("never breaks the workspace when the relay fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    configureProductEvents({ enabled: true });
    trackProductEvent("insight_opened");
    await expect(flushProductEvents()).resolves.toBeUndefined();
  });

  it("discards buffered events when the workspace is disabled", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    configureProductEvents({ enabled: true });
    trackProductEvent("insight_opened");
    configureProductEvents({ enabled: false });
    await flushProductEvents();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
