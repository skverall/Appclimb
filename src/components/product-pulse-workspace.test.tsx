// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductPulseWorkspace } from "@/components/product-pulse-workspace";
import { demoSnapshot } from "@/lib/demo-data";

afterEach(() => {
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
      screen.getByRole("heading", { name: "Add an app" }),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText("Type your App Store app name"),
      { target: { value: "Car Dealer Tracker" } },
    );
    await waitFor(
      () => {
        expect(
          screen.getByRole("button", { name: /Car Dealer Tracker/i }),
        ).toBeInTheDocument();
      },
      { timeout: 2_000 },
    );

    // The real App Store icon must be rendered, not a letter placeholder.
    const resultButton = screen.getByRole("button", {
      name: /Car Dealer Tracker/i,
    });
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
});
