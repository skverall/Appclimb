// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SourcesView } from "@/components/sources-view";
import { demoSnapshot } from "@/lib/demo-data";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
