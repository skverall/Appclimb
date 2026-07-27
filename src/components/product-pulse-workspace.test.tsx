// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductPulseWorkspace } from "@/components/product-pulse-workspace";
import { demoSnapshot } from "@/lib/demo-data";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProductPulseWorkspace", () => {
  it("searches the App Store from the Add app flow and explains Google Play", async () => {
    const snapshot = {
      ...demoSnapshot,
      mode: "live" as const,
      app: {
        ...demoSnapshot.app,
        id: "7f83ea04-6328-4c03-b49a-7e220287fe6e",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/apps") {
          return Response.json({
            data: [
              {
                id: snapshot.app.id,
                name: snapshot.app.name,
                platform: "iOS",
                bundleId: "com.example.app",
                appStoreId: "123",
                storefront: "US",
                configured: true,
              },
            ],
          });
        }
        if (url.startsWith("/api/keywords?")) {
          return Response.json({ data: [] });
        }
        // Catalog search now runs in the browser against iTunes directly
        // (Apple blocks Cloudflare Workers IPs, but allows CORS *).
        if (url.startsWith("https://itunes.apple.com/search")) {
          return Response.json({
            resultCount: 1,
            results: [
              {
                trackId: 6756513314,
                trackName: "Car Dealer Tracker",
                bundleId: "com.aydmaxx.carddealertracker",
                sellerName: "Aydmaxx",
                primaryGenreName: "Business",
                artworkUrl100:
                  "https://is1-ssl.mzstatic.com/image/thumb/icon.png/100x100bb.jpg",
                trackViewUrl: "https://apps.apple.com/app/id6756513314",
              },
            ],
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    render(
      <ProductPulseWorkspace snapshot={snapshot} onOpenSources={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add app" }));
    expect(
      screen.getByRole("heading", { name: /Add an app/i }),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText(/type app name/i),
      { target: { value: "Car Dealer Tracker" } },
    );
    await waitFor(
      () => {
        expect(
          document.querySelector(".app-search-result"),
        ).not.toBeNull();
      },
      { timeout: 2_000 },
    );

    // The real App Store icon must be rendered, not a letter placeholder.
    const resultButton = document.querySelector<HTMLButtonElement>(
      ".app-search-result",
    )!;
    const icon = resultButton.querySelector("img");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("src")).toBe(
      "https://is1-ssl.mzstatic.com/image/thumb/icon.png/100x100bb.jpg",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Google Play" }));
    expect(
      screen.getByText(/requires a Play Console connection/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/will not scrape or invent private Play data/i),
    ).toBeInTheDocument();
  });

  it("adds a Web SaaS and shows install guidance", async () => {
    const snapshot = {
      ...demoSnapshot,
      mode: "live" as const,
      app: {
        ...demoSnapshot.app,
        id: "7f83ea04-6328-4c03-b49a-7e220287fe6e",
      },
    };
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        href: "https://appclimb.app/?app=7f83ea04-6328-4c03-b49a-7e220287fe6e",
        origin: "https://appclimb.app",
        assign,
      },
    });

    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (
            url === "/api/apps" &&
            (!init || init.method === undefined || init.method === "GET")
          ) {
            return Response.json({
              data: [
                {
                  id: snapshot.app.id,
                  name: snapshot.app.name,
                  platform: "iOS",
                  bundleId: "com.example.app",
                  appStoreId: "123",
                  storefront: "US",
                  configured: true,
                },
              ],
            });
          }
          if (url === "/api/apps" && init?.method === "POST") {
            return Response.json(
              {
                data: {
                  id: "web-app-id",
                  name: "Car Dealer Tracker",
                  platform: "Web",
                  bundleId: "cardealertracker.app",
                  property: {
                    id: "prop-1",
                    domain: "cardealertracker.app",
                    trackingToken: "acwa1_test_token",
                    created: true,
                  },
                },
              },
              { status: 201 },
            );
          }
          if (url.startsWith("/api/keywords?")) {
            return Response.json({ data: [] });
          }
          return new Response("not found", { status: 404 });
        }),
      );

      render(
        <ProductPulseWorkspace snapshot={snapshot} onOpenSources={vi.fn()} />,
      );
      fireEvent.click(screen.getByLabelText("Add app"));
      fireEvent.click(screen.getByRole("tab", { name: "Web SaaS" }));
      fireEvent.change(screen.getByPlaceholderText(/site URL or domain/i), {
        target: { value: "https://cardealertracker.app" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Add Web SaaS/i }));

      await waitFor(() => {
        expect(screen.getByText(/Web SaaS connected/i)).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Install tracking on cardealertracker.app/i),
      ).toBeInTheDocument();
      // Agent prompt is the default install method.
      expect(
        screen.getByRole("tab", { name: /AI Agent Prompt/i }),
      ).toHaveAttribute("aria-selected", "true");
      expect(screen.getByText(/acwa1_test_token/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Copy AI agent prompt/i }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("tab", { name: /HTML Snippet/i }));
      expect(
        screen.getByRole("button", { name: /Copy install snippet/i }),
      ).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: /Open Acquisition Atlas/i }),
      );
      expect(assign).toHaveBeenCalled();
      const target = String(assign.mock.calls[0]?.[0] ?? "");
      expect(target).toContain("app=web-app-id");
      expect(target).toContain("atlas=1");
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
