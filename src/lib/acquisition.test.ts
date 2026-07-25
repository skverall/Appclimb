import { describe, expect, it } from "vitest";

import { isAcquisitionEnvelope } from "@/lib/acquisition";
import {
  demoAcquisitionSnapshot,
  demoAcquisitionSnapshotForWindow,
  emptyAcquisitionSnapshot,
} from "@/lib/acquisition-demo";

describe("acquisition snapshots", () => {
  it("keeps demo data explicitly synthetic", () => {
    expect(demoAcquisitionSnapshot.mode).toBe("demo");
    expect(demoAcquisitionSnapshot.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "AI Referral" }),
        expect.objectContaining({ label: "Social" }),
      ]),
    );
  });

  it("creates a truthful zero state", () => {
    const empty = emptyAcquisitionSnapshot();
    expect(empty.mode).toBe("empty");
    expect(empty.property).toBeUndefined();
    expect(empty.totals.pageviews).toBe(0);
  });

  it("moves every demo figure when the analytics window changes", () => {
    const week = demoAcquisitionSnapshotForWindow(7);
    const quarter = demoAcquisitionSnapshotForWindow(90);

    expect(week).toBe(demoAcquisitionSnapshot);
    expect(quarter.windowDays).toBe(90);
    expect(quarter.series).toHaveLength(90);
    expect(quarter.totals.visitors).toBeGreaterThan(week.totals.visitors);
    expect(quarter.totals.pageviews).toBeGreaterThan(week.totals.pageviews);
    expect(quarter.crawlers.requests).toBeGreaterThan(week.crawlers.requests);
  });

  it("keeps scaled demo breakdowns consistent with their totals", () => {
    for (const windowDays of [7, 30, 90] as const) {
      const snapshot = demoAcquisitionSnapshotForWindow(windowDays);
      const channelVisitors = snapshot.channels.reduce(
        (sum, channel) => sum + channel.visitors,
        0,
      );
      const seriesVisitors = snapshot.series.reduce(
        (sum, point) => sum + point.visitors,
        0,
      );
      const crawlerCategories = snapshot.crawlers.categories.reduce(
        (sum, entry) => sum + entry.requests,
        0,
      );
      const crawlerSeries = snapshot.crawlers.series.reduce(
        (sum, entry) => sum + entry.requests,
        0,
      );

      expect(channelVisitors).toBe(snapshot.totals.visitors);
      expect(crawlerCategories).toBe(snapshot.crawlers.requests);
      expect(crawlerSeries).toBe(snapshot.crawlers.requests);
      if (windowDays !== 7) {
        expect(seriesVisitors).toBe(snapshot.totals.visitors);
      }
      expect(snapshot.totals.engaged).toBeLessThan(snapshot.totals.visitors);
      expect(snapshot.totals.converted).toBeLessThan(snapshot.totals.engaged);
    }
  });

  it("keeps crawler providers adding up inside their own category", () => {
    for (const windowDays of [7, 30, 90] as const) {
      const { crawlers } = demoAcquisitionSnapshotForWindow(windowDays);

      for (const { category, requests } of crawlers.categories) {
        const scoped = crawlers.providers.filter(
          (provider) => provider.category === category,
        );
        expect(scoped.length).toBeGreaterThan(0);
        expect(
          scoped.reduce((sum, provider) => sum + provider.requests, 0),
        ).toBe(requests);
        // The authored seven-day shares are rounded to three decimals, so
        // they land near one rather than exactly on it.
        expect(
          scoped.reduce((sum, provider) => sum + provider.share, 0),
        ).toBeCloseTo(1, 2);
      }

      // Requested pages are a top-N slice, so they only have to stay within
      // the category they are attributed to.
      for (const { category, requests } of crawlers.categories) {
        const scoped = crawlers.pages.filter(
          (page) => page.category === category,
        );
        expect(scoped.length).toBeGreaterThan(0);
        expect(
          scoped.reduce((sum, page) => sum + page.requests, 0),
        ).toBeLessThanOrEqual(requests);
      }
    }
  });

  it("ages demo visitor rows against the snapshot, not wall-clock time", () => {
    const generatedMs = Date.parse(demoAcquisitionSnapshot.generatedAt);
    for (const visitor of demoAcquisitionSnapshot.visitors) {
      const seenMs = Date.parse(visitor.lastSeen);
      expect(seenMs).toBeLessThanOrEqual(generatedMs);
      expect(generatedMs - seenMs).toBeLessThan(
        demoAcquisitionSnapshot.windowDays * 86_400_000,
      );
    }
  });

  it("accepts backend envelopes with the required shape", () => {
    const data = Object.fromEntries(
      Object.entries(demoAcquisitionSnapshot).filter(
        ([key]) => key !== "mode" && key !== "windowDays",
      ),
    );
    expect(
      isAcquisitionEnvelope({
        data,
        meta: { mode: "live", windowDays: 7 },
      }),
    ).toBe(true);
  });
});
