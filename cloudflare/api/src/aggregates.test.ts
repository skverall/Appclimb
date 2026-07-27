import { generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deriveActivationCohort,
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
    const queries: string[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const query = JSON.parse(String(init?.body)) as {
        query: { query: string };
      };
      queries.push(query.query.query);
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

    // One daily-reach query plus one cohort query. The cohort answer is not
    // usable here, so no cohort rows are emitted and nothing is faked.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queries[1]).toContain("cohort");
    expect(rows.map(({ metricKey, value }) => ({ metricKey, value }))).toEqual([
      { metricKey: "activated_users", value: 12 },
      { metricKey: "active_users", value: 30 },
    ]);
  });

  it("emits automatic product-flow points from the same PostHog query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          results: [
            ["2026-07-25", "$pageview", 40],
            ["2026-07-25", "guest_first_car_added", 16],
            ["2026-07-25", "subscription_started", 4],
          ],
        }),
      ),
    );

    const rows = await readAggregates(
      "posthog",
      {
        personalApiKey: "phx_key",
        projectId: "project-1",
        host: "https://us.posthog.com",
        activationEvent: "guest_first_car_added",
        sessionEvent: "$pageview",
        detectedEventCount: 48,
        mappingMode: "automatic",
        eventFlow: [
          { event: "$pageview", label: "Pageview", phase: "visit" },
          {
            event: "guest_first_car_added",
            label: "Guest first car added",
            phase: "value",
          },
          {
            event: "subscription_started",
            label: "Subscription started",
            phase: "monetize",
          },
        ],
      },
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-26T00:00:00.000Z"),
    );

    expect(rows.map((row) => row.metricKey)).toEqual([
      "active_users",
      "posthog_flow_1",
      "activated_users",
      "posthog_flow_2",
      "posthog_flow_3",
    ]);
    expect(rows[1]?.dimensions).toMatchObject({
      event: "$pageview",
      detectedEventCount: "48",
      mappingMode: "automatic",
    });
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

describe("PostHog activation cohort", () => {
  const cohortCredentials = {
    personalApiKey: "phx_key",
    projectId: "project-1",
    host: "https://us.posthog.com",
    activationEvent: "first_value_reached",
    sessionEvent: "mobile_session",
  };
  const from = new Date("2026-05-01T00:00:00.000Z");
  const to = new Date("2026-07-26T00:00:00.000Z");

  function stubCohort(cohortResults: unknown[]) {
    let call = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      call += 1;
      const body = JSON.parse(String(init?.body)) as {
        query: { query: string };
      };
      if (call === 1) return Response.json({ results: [] });
      expect(body.query.query).toContain("interval 7 day");
      return Response.json({ results: cohortResults });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("emits a distinct-user cohort, not a ratio of summed user-days", async () => {
    stubCohort([[240, 66]]);

    const rows = await readAggregates("posthog", cohortCredentials, from, to);
    const cohort = deriveActivationCohort(
      rows.map((row) => ({
        metric_key: row.metricKey,
        value: row.value,
        occurred_at: row.occurredAt,
        dimensions: row.dimensions,
      })),
    );

    expect(cohort).not.toBeNull();
    expect(cohort?.newUsers).toBe(240);
    expect(cohort?.activatedUsers).toBe(66);
    expect(cohort?.activationRate).toBeCloseTo(66 / 240, 10);
    expect(cohort?.sampleSize).toBe(240);
    expect(cohort?.activationWindowDays).toBe(7);
    expect(cohort?.sessionEvent).toBe("mobile_session");
    expect(cohort?.activationEvent).toBe("first_value_reached");
    // The cohort must close a full activation window before the sync window
    // ends, so every member had a real chance to activate.
    expect(cohort?.cohortEnd).toBe("2026-07-19T00:00:00.000Z");
    expect(
      new Date(cohort?.cohortStart ?? 0).getTime(),
    ).toBeLessThan(new Date(cohort?.cohortEnd ?? 0).getTime());
  });

  it("excludes users seen before the cohort window from the new-user cohort", async () => {
    const fetchMock = stubCohort([[10, 4]]);
    await readAggregates("posthog", cohortCredentials, from, to);

    const cohortQuery = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body),
    ) as { query: { query: string } };
    expect(cohortQuery.query.query).toContain(
      "having min(timestamp) >= toDateTime('2026-06-19 00:00:00','UTC')",
    );
    // 30-day lookback before the cohort start, so returning users are not
    // counted as new signups.
    expect(cohortQuery.query.query).toContain(
      "timestamp >= toDateTime('2026-05-20 00:00:00','UTC')",
    );
  });

  it("never reports a zero activation rate when the cohort is unmeasurable", async () => {
    stubCohort([[0, 0]]);

    const rows = await readAggregates("posthog", cohortCredentials, from, to);
    expect(
      rows.filter((row) => row.metricKey.startsWith("activation_cohort")),
    ).toHaveLength(0);
    expect(deriveActivationCohort([])).toBeNull();
  });

  it("keeps the import alive when the cohort query is rejected", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return Response.json({
            results: [["2026-07-10", "mobile_session", 30]],
          });
        }
        return new Response("nope", { status: 400 });
      }),
    );

    const rows = await readAggregates("posthog", cohortCredentials, from, to);
    expect(rows.map((row) => row.metricKey)).toEqual(["active_users"]);
  });

  it("skips the cohort when session and activation are the same event", async () => {
    const fetchMock = vi.fn(async () => Response.json({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await readAggregates(
      "posthog",
      { ...cohortCredentials, activationEvent: "mobile_session" },
      from,
      to,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reads the most recent cohort and clamps activated users to the cohort", () => {
    const cohort = deriveActivationCohort([
      {
        metric_key: "activation_cohort_new_users",
        value: 100,
        occurred_at: "2026-06-01T00:00:00.000Z",
        dimensions: JSON.stringify({
          cohortStart: "2026-05-01T00:00:00.000Z",
          cohortEnd: "2026-06-01T00:00:00.000Z",
          activationWindowDays: "7",
        }),
      },
      {
        metric_key: "activation_cohort_activated_users",
        value: 10,
        occurred_at: "2026-06-01T00:00:00.000Z",
        dimensions: JSON.stringify({ activationWindowDays: "7" }),
      },
      {
        metric_key: "activation_cohort_new_users",
        value: 50,
        occurred_at: "2026-07-01T00:00:00.000Z",
        dimensions: JSON.stringify({
          cohortStart: "2026-06-01T00:00:00.000Z",
          cohortEnd: "2026-07-01T00:00:00.000Z",
          activationWindowDays: "14",
        }),
      },
      {
        metric_key: "activation_cohort_activated_users",
        value: 900,
        occurred_at: "2026-07-01T00:00:00.000Z",
        dimensions: JSON.stringify({ activationWindowDays: "14" }),
      },
    ]);

    expect(cohort?.newUsers).toBe(50);
    expect(cohort?.activatedUsers).toBe(50);
    expect(cohort?.activationRate).toBe(1);
    expect(cohort?.activationWindowDays).toBe(14);
    expect(cohort?.cohortEnd).toBe("2026-07-01T00:00:00.000Z");
  });

  it("ignores activity metrics that are not the cohort", () => {
    expect(
      deriveActivationCohort([
        {
          metric_key: "active_users",
          value: 900,
          occurred_at: "2026-07-01T00:00:00.000Z",
          dimensions: "{}",
        },
        {
          metric_key: "activated_users",
          value: 120,
          occurred_at: "2026-07-01T00:00:00.000Z",
          dimensions: "{}",
        },
      ]),
    ).toBeNull();
  });
});
