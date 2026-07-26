// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { StrictMode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SourcesView } from "@/components/sources-view";
import { demoSnapshot } from "@/lib/demo-data";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

function sourceSnapshot() {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.mode = "empty" as const;
  snapshot.sources = snapshot.sources.map((source) => ({
    ...source,
    status: "not-connected" as const,
    lastErrorCode: null,
    lastSyncAt: null,
    syncStatus: null,
    syncAttempt: 0,
    syncMaxAttempts: 0,
    metricCount: 0,
  }));
  const posthog = snapshot.sources.find((source) => source.provider === "posthog");
  if (!posthog) throw new Error("PostHog fixture missing");
  posthog.status = "connected";
  posthog.syncStatus = "retrying";
  posthog.syncAttempt = 1;
  posthog.syncMaxAttempts = 6;
  posthog.lastErrorCode = "provider_unavailable";
  return snapshot;
}

describe("guided Sources experience", () => {
  it("keeps source shortcuts working under React Strict Mode", async () => {
    const snapshot = sourceSnapshot();
    const apple = snapshot.sources.find(
      (source) => source.provider === "app-store-connect",
    );
    if (!apple) throw new Error("App Store Connect fixture missing");
    apple.status = "connected";
    apple.lastErrorCode = "apple_reports_pending";
    window.history.replaceState(
      null,
      "",
      "/?view=sources&source=app-store-connect",
    );

    render(
      <StrictMode>
        <SourcesView
          snapshot={snapshot}
          authenticated
          entitled
          sources={snapshot.sources}
          onSourcesChange={vi.fn()}
          onOpenGrowthRiver={vi.fn()}
          onOpenAcquisitionAtlas={vi.fn()}
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "App Store Connect" }),
      ).toBeInTheDocument();
    });
    expect(window.location.search).toBe("?view=sources");
  });

  it("turns PostHog zero rows into a real event chooser without reauthorization", async () => {
    const snapshot = sourceSnapshot();
    const posthog = snapshot.sources.find(
      (source) => source.provider === "posthog",
    );
    if (!posthog) throw new Error("PostHog fixture missing");
    posthog.syncStatus = "failed";
    posthog.lastErrorCode = "no_data_in_window";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/connections/posthog/events") {
          return Response.json({
            data: {
              events: [
                {
                  name: "onboarding_started",
                  eventCount: 18,
                  uniqueUsers: 7,
                  lastSeenAt: "2026-07-25T12:00:00.000Z",
                },
                {
                  name: "$screen",
                  eventCount: 120,
                  uniqueUsers: 11,
                  lastSeenAt: "2026-07-26T09:00:00.000Z",
                },
              ],
              activationEvent: "app_activated",
              sessionEvent: "$session_start",
              windowDays: 30,
            },
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    render(
      <SourcesView
        snapshot={snapshot}
        authenticated
        entitled
        sources={snapshot.sources}
        onSourcesChange={vi.fn()}
        onOpenGrowthRiver={vi.fn()}
        onOpenAcquisitionAtlas={vi.fn()}
      />,
    );

    const postHogRow = screen.getByText("PostHog").closest("button");
    expect(postHogRow).not.toBeNull();
    fireEvent.click(postHogRow!);
    expect(
      screen.getByText(/selected event names were not seen in the last 30 days/i),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /choose posthog events/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/changing these events does not require authorization/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.getAllByRole("option", { name: /onboarding_started/i }).length,
    ).toBe(2);
    expect(
      screen.queryByDisplayValue("app_activated"),
    ).not.toBeInTheDocument();
  });

  it("separates saved access from imported data and names the destination", () => {
    const snapshot = sourceSnapshot();
    render(
      <SourcesView
        snapshot={snapshot}
        authenticated
        entitled
        sources={snapshot.sources}
        onSourcesChange={vi.fn()}
        onOpenGrowthRiver={vi.fn()}
        onOpenAcquisitionAtlas={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "0 of 4 systems have live data" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/retrying import · 1\/6/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Acquisition Atlas uses AppClimb tracking — not PostHog/i),
    ).toBeInTheDocument();

    const postHogRow = screen.getByText("PostHog").closest("button");
    expect(postHogRow).not.toBeNull();
    fireEvent.click(postHogRow!);

    expect(screen.getByText("Saved securely")).toBeInTheDocument();
    expect(
      screen.getAllByText("Growth River · Activate").length,
    ).toBeGreaterThan(1);
    expect(
      screen.getByRole("button", { name: /retry import/i }),
    ).toBeInTheDocument();
  });

  it("counts a source as ready only after metric points exist", () => {
    const snapshot = sourceSnapshot();
    const posthog = snapshot.sources.find((source) => source.provider === "posthog");
    if (!posthog) throw new Error("PostHog fixture missing");
    posthog.syncStatus = "succeeded";
    posthog.lastErrorCode = null;
    posthog.metricCount = 12;

    render(
      <SourcesView
        snapshot={snapshot}
        authenticated
        entitled
        sources={snapshot.sources}
        onSourcesChange={vi.fn()}
        onOpenGrowthRiver={vi.fn()}
        onOpenAcquisitionAtlas={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "1 of 4 systems have live data" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("12 metric points live").length).toBeGreaterThan(0);
  });
});
