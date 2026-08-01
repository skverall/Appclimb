// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { demoSnapshot } from "@/lib/demo-data";
import { StoreScoutView } from "./store-scout-view";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StoreScoutView", () => {
  it("exposes real keyword tracking controls for an iOS App Store listing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/keywords?")) {
        return Response.json({ data: [] });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = {
      ...demoSnapshot,
      mode: "live" as const,
      app: {
        ...demoSnapshot.app,
        id: "7f83ea04-6328-4c03-b49a-7e220287fe6e",
        platform: "iOS" as const,
        appStoreId: "6756513314",
        storefront: "US",
      },
    };

    render(<StoreScoutView snapshot={snapshot} onOpenSettings={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Store Scout" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Keyword Terrain" }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add a keyword")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Smart suggestions/i }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/keywords?appId="),
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });
});
