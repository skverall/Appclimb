// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrackingVerificationGate } from "@/components/tracking-verification-gate";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const property = {
  id: "prop-1",
  name: "AppClimb",
  domain: "appclimb.app",
  trackingToken: "acwa1_test",
  tokenVersion: 1,
  retentionDays: 90,
  createdAt: "2026-07-27T00:00:00.000Z",
};

const snippet = `<script src="https://appclimb.app/appclimb-analytics.js" data-token="acwa1_test" defer></script>`;

describe("TrackingVerificationGate", () => {
  it("shows listening state and verify CTA before traffic exists", () => {
    const onCheck = vi.fn();
    render(
      <TrackingVerificationGate
        property={property}
        snippet={snippet}
        collectorOrigin="https://appclimb.app"
        checking={false}
        lastCheckFailed={false}
        verified={false}
        onCheck={onCheck}
        onVerifiedContinue={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Waiting for the script on appclimb.app/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Listening$/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Verify connection/i }));
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("tab", { name: /AI Agent Prompt/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("celebrates a verified install and continues to the atlas", () => {
    const onContinue = vi.fn();
    render(
      <TrackingVerificationGate
        property={property}
        snippet={snippet}
        collectorOrigin="https://appclimb.app"
        checking={false}
        lastCheckFailed={false}
        verified
        onCheck={vi.fn()}
        onVerifiedContinue={onContinue}
      />,
    );

    expect(
      screen.getByText(/appclimb.app is sending data/i),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Open live Acquisition Atlas/i }),
    );
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("explains a failed verification honestly", () => {
    render(
      <TrackingVerificationGate
        property={property}
        snippet={snippet}
        collectorOrigin="https://appclimb.app"
        checking={false}
        lastCheckFailed
        verified={false}
        onCheck={vi.fn()}
        onVerifiedContinue={vi.fn()}
      />,
    );

    expect(screen.getByText(/No events yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Not detected/i)).toBeInTheDocument();
  });
});
