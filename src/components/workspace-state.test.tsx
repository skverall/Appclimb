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

import {
  EmptyWorkspaceView,
  NoEvidenceView,
  UnavailableWorkspaceView,
} from "@/components/workspace-state";
import { SourcesView } from "@/components/workspace-views";
import { demoSnapshot } from "@/lib/demo-data";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("honest workspace states", () => {
  it("keeps a configured zero-row workspace out of the first-connect state", () => {
    const snapshot = structuredClone(demoSnapshot);
    snapshot.mode = "empty";
    snapshot.insights = [];
    snapshot.sources = snapshot.sources.map((source, index) => ({
      ...source,
      status:
        index === 0
          ? ("connected" as const)
          : ("not-connected" as const),
      lastSyncAt: null,
    }));

    render(
      <EmptyWorkspaceView
        snapshot={snapshot}
        onOpenSources={vi.fn()}
        onOpenMethodology={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Finish your first truthful growth map",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no supported aggregate metric has completed import/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /connect first source/i }),
    ).not.toBeInTheDocument();
  });

  it("distinguishes observed metrics without a defensible baseline", () => {
    render(
      <NoEvidenceView
        section="Diagnose"
        hasObservedMetrics
        onOpenSources={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "No defensible constraint yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/instead of inventing a benchmark/i)).toBeInTheDocument();
  });

  it("states that an outage never substitutes demo values", () => {
    render(<UnavailableWorkspaceView onRetry={vi.fn()} />);

    expect(
      screen.getByRole("heading", {
        name: "Your workspace could not be loaded",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not showing demo values/i)).toBeInTheDocument();
  });
});

describe("restricted source recovery", () => {
  it("keeps selection accessible and permits credential revocation", async () => {
    const snapshot = structuredClone(demoSnapshot);
    snapshot.mode = "restricted";
    snapshot.sources[0] = {
      ...snapshot.sources[0],
      status: "needs-attention",
      lastErrorCode: "no_data_in_window",
    };
    const onSourcesChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <SourcesView
        snapshot={snapshot}
        authenticated
        entitled={false}
        sources={snapshot.sources}
        onSourcesChange={onSourcesChange}
      />,
    );

    const selectedCard = screen.getByRole("button", {
      name: /App Store Connect/i,
    });
    expect(selectedCard).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/credentials may still be valid/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /^review connection$/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /revoke connection/i }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/connections/app-store-connect",
        { method: "DELETE" },
      );
    });
    expect(onSourcesChange).toHaveBeenCalledOnce();
  });
});
