import { afterEach, describe, expect, it, vi } from "vitest";

import { postHogConnector } from "@/lib/connectors/posthog";
import { revenueCatConnector } from "@/lib/connectors/revenuecat";
import { ConnectorError } from "@/lib/connectors/types";

describe("connector verification", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses RevenueCat v2 bearer auth and chart read scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ object: "chart_options" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await revenueCatConnector.verify({
      apiKey: "secret",
      projectId: "proj_123",
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.revenuecat.com/v2/projects/proj_123/charts/revenue/options",
      expect.objectContaining({
        headers: { Authorization: "Bearer secret" },
      }),
    );
  });

  it("marks rate limits retryable and revoked keys non-retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 429 })),
    );
    await expect(
      revenueCatConnector.verify({
        apiKey: "limited",
        projectId: "proj",
      }),
    ).rejects.toMatchObject({
      retryable: true,
    } satisfies Partial<ConnectorError>);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );
    await expect(
      revenueCatConnector.verify({
        apiKey: "revoked",
        projectId: "proj",
      }),
    ).rejects.toMatchObject({
      retryable: false,
    } satisfies Partial<ConnectorError>);
  });

  it("rejects non-HTTPS PostHog hosts before sending a secret", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postHogConnector.verify({
        host: "http://example.com",
        personalApiKey: "secret",
        projectId: "1",
      }),
    ).rejects.toThrow("must use HTTPS");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
