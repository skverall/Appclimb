// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { TrackingVerificationGate } from "@/components/tracking-verification-gate";
import {
  describeDayOverDay,
  visitorBucket,
} from "@/components/acquisition-atlas";
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

describe("Acquisition Atlas readability helpers", () => {
  // Reference: 2026-07-27T12:00:00Z, so "today" is the 27th in UTC.
  const REFERENCE = Date.parse("2026-07-27T12:00:00.000Z");

  describe("visitorBucket", () => {
    it("buckets by whole UTC days against the snapshot, not wall clock", () => {
      expect(visitorBucket("2026-07-27T23:59:00.000Z", REFERENCE)).toBe(0);
      expect(visitorBucket("2026-07-27T00:00:00.000Z", REFERENCE)).toBe(0);
      expect(visitorBucket("2026-07-26T23:59:00.000Z", REFERENCE)).toBe(1);
      expect(visitorBucket("2026-07-21T06:00:00.000Z", REFERENCE)).toBe(6);
      expect(visitorBucket("2026-07-20T06:00:00.000Z", REFERENCE)).toBe(7);
    });

    it("treats a visit later than the snapshot as today rather than negative", () => {
      expect(visitorBucket("2026-07-28T01:00:00.000Z", REFERENCE)).toBe(0);
    });

    it("returns null for an unparseable timestamp instead of guessing", () => {
      expect(visitorBucket("not-a-date", REFERENCE)).toBeNull();
      expect(visitorBucket("2026-07-27T00:00:00.000Z", Number.NaN)).toBeNull();
    });
  });

  describe("describeDayOverDay", () => {
    it("states whole visitors when yesterday is too small for a rate", () => {
      // The regression this guards: 1 -> 11 is a truthful +1000% and a
      // useless one.
      expect(describeDayOverDay(11, 1)).toEqual({
        direction: "up",
        label: "11 today vs 1 yesterday",
      });
      expect(describeDayOverDay(0, 4)?.label).toBe("0 today vs 4 yesterday");
    });

    it("uses a percentage once yesterday carries enough visitors", () => {
      expect(describeDayOverDay(120, 100)).toEqual({
        direction: "up",
        label: "20% vs yesterday",
      });
      expect(describeDayOverDay(80, 100)).toEqual({
        direction: "down",
        label: "20% vs yesterday",
      });
    });

    it("says nothing at all when there is nothing to compare", () => {
      expect(describeDayOverDay(0, 0)).toBeNull();
    });
  });
});
