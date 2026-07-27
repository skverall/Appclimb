// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionPlan, DashboardSnapshot } from "@/lib/contracts";
import { demoSnapshot } from "@/lib/demo-data";
import type { BackendIdentity } from "@/lib/backend";

// The shell imports the sign-out server action, which pulls in `server-only`.
// The Lab flow under test never invokes it.
vi.mock("@/app/actions", () => ({
  logout: async () => undefined,
}));

const { AppClimbShell } = await import("@/components/app-climb-shell");

const session: BackendIdentity = {
  userId: "user-1",
  email: "founder@example.com",
  avatarKey: "ridge",
  workspaceId: "ws-1",
  workspaceName: "Private workspace",
  role: "owner",
  trialEndsAt: "2026-08-10T00:00:00.000Z",
  subscriptionStatus: "active",
};

const activationPlan: ActionPlan = {
  targetStageId: "activate",
  problem: "Activation rate (21.0%) trails the 35% benchmark.",
  desiredOutcome: "Raise first key action within 24h to the benchmark.",
  whyThisAction: "Activate is the earliest supported constraint in the window.",
  steps: [
    {
      order: 1,
      title: "Remove the workspace configuration gate",
      instruction:
        "Let the first vehicle be created before the workspace is configured.",
      effort: "medium",
    },
  ],
  prerequisites: ["PostHog activation event confirmed"],
  instrumentation: ["activation_rate from PostHog"],
  primaryMetric: {
    key: "activation_rate",
    label: "Activation rate",
    targetDirection: "up",
  },
  guardrails: [{ key: "d7_retention", label: "D7 retention" }],
  segment: "New installs",
  minimumSample: 400,
  minimumCompleteDays: 14,
  stopCondition: "Run for 14 complete UTC days.",
  rollbackCondition: "Revert if D7 retention drops by more than 3 points.",
  evidenceIds: ["ev-activation"],
  sourceProviders: ["posthog"],
};

/** A private workspace snapshot: real mode, no experiments returned yet. */
function liveSnapshot(): DashboardSnapshot {
  const snapshot = structuredClone(demoSnapshot) as DashboardSnapshot;
  snapshot.mode = "live";
  snapshot.experiments = [];
  snapshot.actionProposals = snapshot.actionProposals.map((proposal) =>
    proposal.insightId === "insight-activation"
      ? { ...proposal, actionPlan: activationPlan }
      : proposal,
  );
  return snapshot;
}

/**
 * A minimal stand-in for the API relay. It keeps rows across renders, which is
 * exactly what "reload" means here: the second mount starts from an empty
 * snapshot and must recover the experiment from the server.
 */
function fakeServer() {
  const rows: Record<string, unknown>[] = [];
  const feedback: Record<string, unknown>[] = [];
  const handler = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://appclimb.app");
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.pathname === "/api/experiments" && method === "GET") {
      return Response.json({ data: rows });
    }
    if (url.pathname === "/api/experiments" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const row = {
        ...body,
        id: `exp-${rows.length + 1}`,
        createdAt: "2026-07-27T10:00:00.000Z",
        updatedAt: "2026-07-27T10:00:00.000Z",
      };
      delete row.appId;
      rows.unshift(row);
      return Response.json({ data: row }, { status: 201 });
    }
    if (url.pathname.startsWith("/api/action-proposals")) {
      feedback.push(JSON.parse(String(init?.body ?? "{}")));
      return Response.json({ data: {} }, { status: 201 });
    }
    if (url.pathname === "/api/product-events") {
      return new Response(null, { status: 202 });
    }
    return new Response(null, { status: 404 });
  });
  return { rows, feedback, handler };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("Journey A steps 12-14 — action plan, experiment, reload", () => {
  it("opens the structured action plan for the selected insight", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.handler);

    render(
      <AppClimbShell
        initialSnapshot={liveSnapshot()}
        initialSection="diagnose"
        initialInsightId="insight-activation"
        session={session}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open action plan/iu }));

    expect(
      await screen.findByText(
        "Raise first key action within 24h to the benchmark.",
      ),
    ).toBeInTheDocument();
    // What to change / where, why, how to measure, validity, stop.
    expect(
      screen.getByText("Remove the workspace configuration gate"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Activate is the earliest supported constraint in the window.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Activation rate")).toBeInTheDocument();
    expect(screen.getByText("14 complete UTC days")).toBeInTheDocument();
    expect(
      screen.getByText(/Run for 14 complete UTC days/u),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Revert if D7 retention drops/u),
    ).toBeInTheDocument();
    expect(screen.getByText(/insight-activation/u)).toBeInTheDocument();
  });

  it("refuses to invent a plan when the diagnosis produced none", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.handler);
    const snapshot = liveSnapshot();
    snapshot.actionProposals = snapshot.actionProposals.map((proposal) => ({
      ...proposal,
      actionPlan: undefined,
    }));

    render(
      <AppClimbShell
        initialSnapshot={snapshot}
        initialSection="diagnose"
        initialInsightId="insight-activation"
        session={session}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open action plan/iu }));

    expect(
      await screen.findByText("No structured action plan yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/AppClimb will not invent one/u),
    ).toBeInTheDocument();
  });

  it("creates a persistent experiment and keeps it after a reload", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.handler);

    const first = render(
      <AppClimbShell
        initialSnapshot={liveSnapshot()}
        initialSection="diagnose"
        initialInsightId="insight-activation"
        session={session}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open action plan/iu }));
    fireEvent.click(
      await screen.findByRole("button", { name: /create experiment/iu }),
    );

    await waitFor(() => expect(server.rows).toHaveLength(1));
    expect(server.rows[0]).toMatchObject({
      insightId: "insight-activation",
      stageId: "activate",
      primaryMetric: "Activation rate",
      guardrailMetric: "D7 retention",
      status: "draft",
    });
    // Converting the proposal is recorded as feedback, not as a silent action.
    await waitFor(() =>
      expect(
        server.feedback.some(
          (item) => item.action === "convert_to_experiment",
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByText(/Experiment saved from activate evidence/u),
    ).toBeInTheDocument();

    // Reload: unmount everything and start again from a snapshot that has no
    // experiments, exactly like a fresh server render.
    first.unmount();
    cleanup();

    render(
      <AppClimbShell
        initialSnapshot={liveSnapshot()}
        initialSection="lab"
        initialInsightId="insight-activation"
        session={session}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Run a shorter onboarding experiment",
      }),
    ).toBeInTheDocument();
  });

  it("says plainly that the public demo does not store experiments", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.handler);

    const snapshot = liveSnapshot();
    snapshot.mode = "demo";

    render(
      <AppClimbShell
        initialSnapshot={snapshot}
        initialSection="diagnose"
        initialInsightId="insight-activation"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open action plan/iu }));
    fireEvent.click(
      await screen.findByRole("button", { name: /create experiment/iu }),
    );

    expect(
      await screen.findByText(/this demo does not store experiments/u),
    ).toBeInTheDocument();
    expect(
      server.handler.mock.calls.filter(([input]) =>
        String(input).includes("/api/experiments"),
      ),
    ).toHaveLength(0);
  });
});
