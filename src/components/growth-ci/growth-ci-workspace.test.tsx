// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GrowthCiWorkspace,
  type GrowthCiSnapshot,
} from "./growth-ci-workspace";

afterEach(() => cleanup());

function snapshot(): GrowthCiSnapshot {
  return {
    product: "growth_ci",
    app: {
      id: "app-1",
      name: "Test iOS App",
      iconUrl: null,
      bundleId: "com.example.app",
    },
    sources: [],
    mapping: null,
    readiness: {
      money: { status: "ready", label: "Money source", detail: "Ready" },
      activation: {
        status: "ready",
        label: "Activation source",
        detail: "Ready",
      },
      version: { status: "ready", label: "Release version", detail: "Ready" },
      overall: "ready",
      nextAction: "Waiting for the next release.",
    },
    access: {
      freeVerdictRemaining: true,
      canRunReleaseChecks: true,
      canUseAgentBridge: true,
      reason: "trial",
    },
    contract: {
      version: "1.0.0",
      freeVerdictConsumedAt: null,
      yaml: "",
    },
    latestRelease: null,
    history: [],
    incident: {
      id: "incident-1",
      title: "Activation regressed",
      summary: "Activation fell after the latest release.",
      severity: "important",
      status: "open",
      outcome: null,
    },
    task: {
      id: "task-1",
      status: "available",
      packet: { incident: { title: "Activation regressed" } },
      claimedBy: null,
      branchName: null,
      commitSha: null,
      pullRequestUrl: null,
    },
  };
}

describe("GrowthCiWorkspace release reporting", () => {
  it("reports a release and can link it to the current growth task", async () => {
    const onReportRelease = vi.fn().mockResolvedValue(undefined);

    render(
      <GrowthCiWorkspace
        snapshot={snapshot()}
        onReportRelease={onReportRelease}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Report release/i }));
    fireEvent.change(screen.getByPlaceholderText("2.4.2"), {
      target: { value: "2.4.2" },
    });
    fireEvent.change(screen.getByPlaceholderText("42"), {
      target: { value: "42" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /This release is the fix for the current task/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Report and evaluate/i }),
    );

    await waitFor(() => {
      expect(onReportRelease).toHaveBeenCalledWith({
        version: "2.4.2",
        buildNumber: "42",
        taskId: "task-1",
      });
    });
    expect(
      await screen.findByText(/Release 2\.4\.2 reported/i),
    ).toBeInTheDocument();
  });
});
