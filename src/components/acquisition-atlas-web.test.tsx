// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { TrackingVerificationGate } from "@/components/tracking-verification-gate";
import type { WebProperty } from "@/lib/acquisition";

describe("Acquisition Atlas & Web Verification Gate", () => {
  const mockProperty: WebProperty = {
    id: "prop-1",
    name: "Test Web App",
    domain: "appclimb.app",
    trackingToken: "acwa1_test_token",
    tokenVersion: 1,
    retentionDays: 30,
    createdAt: "2026-07-01T00:00:00Z",
  };

  it("renders listening status and copyable installation script", () => {
    const handleCheck = vi.fn();
    const handleContinue = vi.fn();

    render(
      <TrackingVerificationGate
        property={mockProperty}
        snippet={`<script src="https://appclimb.app/ac.js" data-token="acwa1_test_token" async></script>`}
        collectorOrigin="https://appclimb.app"
        checking={false}
        lastCheckFailed={false}
        verified={false}
        onCheck={handleCheck}
        onVerifiedContinue={handleContinue}
      />
    );

    expect(screen.getByText("Waiting for the script on appclimb.app")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Verify connection/i })).toBeInTheDocument();

    const verifyBtn = screen.getByRole("button", { name: /Verify connection/i });
    fireEvent.click(verifyBtn);

    expect(handleCheck).toHaveBeenCalled();
  });

  it("renders verified status and celebratory continue CTA when event arrives", () => {
    const handleCheck = vi.fn();
    const handleContinue = vi.fn();

    render(
      <TrackingVerificationGate
        property={mockProperty}
        snippet={`<script src="https://appclimb.app/ac.js" data-token="acwa1_test_token" async></script>`}
        collectorOrigin="https://appclimb.app"
        checking={false}
        lastCheckFailed={false}
        verified={true}
        onCheck={handleCheck}
        onVerifiedContinue={handleContinue}
      />
    );

    expect(screen.getByText("appclimb.app is sending data")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open live Acquisition Atlas/i })).toBeInTheDocument();

    const continueBtn = screen.getByRole("button", { name: /Open live Acquisition Atlas/i });
    fireEvent.click(continueBtn);

    expect(handleContinue).toHaveBeenCalled();
  });
});
