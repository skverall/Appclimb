import { describe, expect, it } from "vitest";
import { deriveWorkspaceReadiness } from "./readiness";

describe("Workspace Readiness Derivation", () => {
  it("returns product_required when app is missing or placeholder", () => {
    const readiness = deriveWorkspaceReadiness({
      app: null,
      sources: [],
      metricCount: 0,
      completeDays: 0,
      hasDiagnosisRun: false,
      hasConfirmedInsight: false,
    });

    expect(readiness.state).toBe("product_required");
    expect(readiness.primaryAction.kind).toBe("add_product");
    expect(readiness.progress).toBe(0);
  });

  it("returns installation_required for Web app without verified tracking event", () => {
    const readiness = deriveWorkspaceReadiness({
      app: { id: "app-1", name: "My Web SaaS", platform: "Web" },
      webProperty: { id: "prop-1", domain: "example.com", firstEventAt: null },
      sources: [],
      metricCount: 0,
      completeDays: 0,
      hasDiagnosisRun: false,
      hasConfirmedInsight: false,
    });

    expect(readiness.state).toBe("installation_required");
    expect(readiness.primaryAction.kind).toBe("install_web_tracking");
    expect(readiness.progress).toBe(20);
  });

  it("returns source_required for iOS app without App Store Connect", () => {
    const readiness = deriveWorkspaceReadiness({
      app: { id: "app-1", name: "My iOS App", platform: "iOS" },
      sources: [],
      metricCount: 0,
      completeDays: 0,
      hasDiagnosisRun: false,
      hasConfirmedInsight: false,
    });

    expect(readiness.state).toBe("source_required");
    expect(readiness.primaryAction.kind).toBe("connect_source");
    expect(readiness.primaryAction.provider).toBe("app-store-connect");
  });

  it("returns source_pending when Apple reports are pending", () => {
    const readiness = deriveWorkspaceReadiness({
      app: { id: "app-1", name: "My iOS App", platform: "iOS" },
      sources: [
        {
          provider: "app-store-connect",
          status: "connected",
          lastErrorCode: "no_data_in_window",
        },
      ],
      metricCount: 0,
      completeDays: 0,
      hasDiagnosisRun: false,
      hasConfirmedInsight: false,
    });

    expect(readiness.state).toBe("source_pending");
    expect(readiness.primaryAction.kind).toBe("connect_source");
    expect(readiness.primaryAction.provider).toBe("posthog");
    expect(readiness.primaryAction.reasonCode).toBe("apple_reports_pending");
  });

  it("returns collecting baseline when data is live but days < 3", () => {
    const readiness = deriveWorkspaceReadiness({
      app: { id: "app-1", name: "My iOS App", platform: "iOS" },
      sources: [{ provider: "app-store-connect", status: "connected" }],
      metricCount: 15,
      completeDays: 1,
      hasDiagnosisRun: false,
      hasConfirmedInsight: false,
    });

    expect(readiness.state).toBe("collecting");
    expect(readiness.primaryAction.kind).toBe("wait");
  });

  it("returns diagnosis_ready when diagnosis run has confirmed bottleneck", () => {
    const readiness = deriveWorkspaceReadiness({
      app: { id: "app-1", name: "My iOS App", platform: "iOS" },
      sources: [{ provider: "app-store-connect", status: "connected" }],
      metricCount: 150,
      completeDays: 14,
      hasDiagnosisRun: true,
      hasConfirmedInsight: true,
    });

    expect(readiness.state).toBe("diagnosis_ready");
    expect(readiness.primaryAction.kind).toBe("open_action_plan");
    expect(readiness.progress).toBe(100);
  });
});
