import { generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  discoverPostHogEvents,
  parseAppleTSV,
  readAggregates,
  refreshPostHogOAuth,
} from "./aggregates";

const appleKeyPair = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const appleCredentials = {
  appId: "6756513314",
  issuerId: "69a6de70-1111-2222-3333-444455556666",
  keyId: "ABCD1234EF",
  privateKey: appleKeyPair.privateKey,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Cloudflare source aggregates", () => {
  it("discovers real PostHog event names from a bounded recent window", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          query: { query: string };
        };
        expect(body.query.query).toContain("interval 30 day");
        expect(body.query.query).toContain("limit 200");
        return Response.json({
          results: [
            ["Application Opened", 23, 9, "2026-07-25T12:30:00Z"],
            ["$screen", 91, 14, "2026-07-26T08:00:00Z"],
            ["not\u0000valid", 1, 1, "2026-07-26T08:00:00Z"],
          ],
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      discoverPostHogEvents({
        personalApiKey: "phx_key",
        projectId: "509825",
        host: "https://us.posthog.com",
      }),
    ).resolves.toEqual([
      {
        name: "Application Opened",
        eventCount: 23,
        uniqueUsers: 9,
        lastSeenAt: "2026-07-25T12:30:00.000Z",
      },
      {
        name: "$screen",
        eventCount: 91,
        uniqueUsers: 14,
        lastSeenAt: "2026-07-26T08:00:00.000Z",
      },
    ]);
  });

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

  it("maps Apple's current engagement and download report fields", () => {
    const from = new Date("2026-07-01T00:00:00.000Z");
    const to = new Date("2026-07-26T00:00:00.000Z");
    const updatedAt = new Date("2026-07-26T00:00:00.000Z");
    const engagement = parseAppleTSV(
      [
        "Date\tEvent\tPage Type\tCounts\tUnique Counts\tTerritory",
        "2026-07-24\tImpression\tNo page\t10\t8\tUS",
        "2026-07-24\tPage view\tProduct page\t4\t3\tUS",
        "2026-07-24\tPage view\tDeveloper page\t20\t18\tUS",
        "2026-07-24\tTap\tProduct page\t2\t2\tUS",
      ].join("\n"),
      from,
      to,
      updatedAt,
      "App Store Discovery and Engagement Standard",
      3,
    );
    const downloads = parseAppleTSV(
      [
        "Date\tDownload Type\tCounts\tTerritory",
        "2026-07-24\tFirst-time Download\t2\tUS",
        "2026-07-24\tRedownload\t1\tUS",
        "2026-07-24\tManual update\t7\tUS",
        "2026-07-24\tRestore\t5\tUS",
      ].join("\n"),
      from,
      to,
      updatedAt,
      "App Downloads Standard",
      2,
    );
    expect(
      [...engagement, ...downloads]
        .sort((left, right) => left.metricKey.localeCompare(right.metricKey))
        .map(({ metricKey, value }) => ({ metricKey, value })),
    ).toEqual([
      { metricKey: "downloads", value: 3 },
      { metricKey: "impressions", value: 10 },
      { metricKey: "product_page_views", value: 4 },
    ]);
  });

  it("uses Apple's read-only report chain without posting or leaking the JWT to segment storage", async () => {
    const calls: Array<{
      url: string;
      method: string;
      hasAuthorization: boolean;
    }> = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const hasAuthorization = new Headers(init?.headers).has("authorization");
        calls.push({ url, method, hasAuthorization });
        if (url.includes("/apps/6756513314/analyticsReportRequests")) {
          return Response.json({
            data: [
              {
                id: "request-1",
                attributes: {
                  accessType: "ONE_TIME_SNAPSHOT",
                  stoppedDueToInactivity: false,
                },
              },
              {
                id: "request-ongoing",
                attributes: {
                  accessType: "ONGOING",
                  stoppedDueToInactivity: false,
                },
              },
            ],
          });
        }
        if (url.includes("/analyticsReportRequests/request-ongoing/reports")) {
          return Response.json({ data: [] });
        }
        if (url.includes("/analyticsReportRequests/request-1/reports")) {
          return Response.json({
            data: [
              {
                id: "report-engagement",
                attributes: {
                  name: "App Store Discovery and Engagement Standard",
                  category: "APP_STORE_ENGAGEMENT",
                },
              },
              {
                id: "report-downloads",
                attributes: {
                  name: "App Downloads Standard",
                  category: "COMMERCE",
                },
              },
            ],
          });
        }
        if (url.includes("/analyticsReports/report-engagement/instances")) {
          return Response.json({
            data: [
              {
                id: "instance-engagement",
                attributes: {
                  granularity: "DAILY",
                  processingDate: "2026-07-26",
                },
              },
            ],
          });
        }
        if (url.includes("/analyticsReports/report-downloads/instances")) {
          return Response.json({
            data: [
              {
                id: "instance-downloads",
                attributes: {
                  granularity: "DAILY",
                  processingDate: "2026-07-26",
                },
              },
            ],
          });
        }
        if (url.includes("/instance-engagement/segments")) {
          return Response.json({
            data: [
              {
                attributes: {
                  url: "https://segments.example.com/engagement.tsv.gz",
                },
              },
            ],
          });
        }
        if (url.includes("/instance-downloads/segments")) {
          return Response.json({
            data: [
              {
                attributes: {
                  url: "https://segments.example.com/downloads.tsv.gz",
                },
              },
            ],
          });
        }
        if (url.endsWith("/engagement.tsv.gz")) {
          return new Response(
            [
              "Date\tEvent\tPage Type\tCounts",
              "2026-07-24\tImpression\tNo page\t10",
              "2026-07-24\tPage view\tProduct page\t4",
            ].join("\n"),
          );
        }
        if (url.endsWith("/downloads.tsv.gz")) {
          return new Response(
            [
              "Date\tDownload Type\tCounts",
              "2026-07-24\tFirst-time Download\t2",
              "2026-07-24\tRedownload\t1",
              "2026-07-24\tAuto-update\t9",
            ].join("\n"),
          );
        }
        return new Response("not found", { status: 404 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await readAggregates(
      "app-store-connect",
      appleCredentials,
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-26T00:00:00.000Z"),
    );

    expect(
      rows.map(({ metricKey, value }) => ({ metricKey, value })),
    ).toEqual([
      { metricKey: "downloads", value: 3 },
      { metricKey: "impressions", value: 10 },
      { metricKey: "product_page_views", value: 4 },
    ]);
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    expect(
      calls.some((call) =>
        call.url.includes(
          "/analyticsReportRequests/request-ongoing/reports",
        ),
      ),
    ).toBe(true);
    expect(
      calls
        .filter((call) => call.url.startsWith("https://segments.example.com/"))
        .every((call) => !call.hasAuthorization),
    ).toBe(true);
  });

  it("surfaces the one-time Apple report initialization requirement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: [] })),
    );
    await expect(
      readAggregates(
        "app-store-connect",
        appleCredentials,
        new Date("2026-07-01T00:00:00.000Z"),
        new Date("2026-07-26T00:00:00.000Z"),
      ),
    ).rejects.toMatchObject({
      code: "apple_report_request_required",
      retryable: false,
    });
  });
});
