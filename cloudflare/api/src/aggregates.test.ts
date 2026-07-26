import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseAppleTSV,
  readAggregates,
  refreshPostHogOAuth,
} from "./aggregates";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Cloudflare source aggregates", () => {
  it("runs a bounded PostHog query and maps configured events", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const query = JSON.parse(String(init?.body)) as {
        query: { query: string };
      };
      expect(query.query.query).toContain("first_value_reached");
      expect(query.query.query).toContain("mobile_session");
      return Response.json({
        results: [
          ["2026-07-25", "first_value_reached", 12],
          ["2026-07-25", "mobile_session", 30],
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await readAggregates(
      "posthog",
      {
        personalApiKey: "phx_key",
        projectId: "project-1",
        host: "https://us.posthog.com",
        activationEvent: "first_value_reached",
        sessionEvent: "mobile_session",
      },
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-26T00:00:00.000Z"),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(rows.map(({ metricKey, value }) => ({ metricKey, value }))).toEqual([
      { metricKey: "activated_users", value: 12 },
      { metricKey: "active_users", value: 30 },
    ]);
  });

  it("refreshes an expired PostHog OAuth token without dropping settings", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          access_token: "access-new",
          refresh_token: "refresh-new",
          expires_in: 3600,
        }),
      ),
    );
    const result = await refreshPostHogOAuth({
      authMethod: "oauth",
      personalApiKey: "access-old",
      oauthRefreshToken: "refresh-old",
      oauthClientId: "https://appclimb.app/api/oauth/posthog/client",
      oauthExpiresAt: "2026-07-26T11:59:00.000Z",
      projectId: "project-1",
    });
    expect(result).toMatchObject({
      changed: true,
      credentials: {
        personalApiKey: "access-new",
        oauthRefreshToken: "refresh-new",
        projectId: "project-1",
        oauthExpiresAt: "2026-07-26T13:00:00.000Z",
      },
    });
  });

  it("sums Apple dimension rows into one app-level daily metric", () => {
    const rows = parseAppleTSV(
      [
        "Date\timpressionsTotal\tpageViewCount\tunits\tTerritory",
        "2026-07-24\t10\t4\t2\tUS",
        "2026-07-24\t5\t3\t1\tGB",
      ].join("\n"),
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-26T00:00:00.000Z"),
      new Date("2026-07-26T00:00:00.000Z"),
    );
    expect(
      rows.map(({ metricKey, value }) => ({ metricKey, value })),
    ).toEqual([
      { metricKey: "downloads", value: 3 },
      { metricKey: "impressions", value: 15 },
      { metricKey: "product_page_views", value: 7 },
    ]);
  });
});
