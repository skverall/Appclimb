/**
 * Three-item measurement readiness for Growth CI onboarding.
 */
export type ReadinessItemStatus =
  | "ready"
  | "blocked"
  | "collecting"
  | "missing";

export interface MeasurementReadiness {
  money: {
    status: ReadinessItemStatus;
    label: string;
    detail: string;
  };
  activation: {
    status: ReadinessItemStatus;
    label: string;
    detail: string;
  };
  version: {
    status: ReadinessItemStatus;
    label: string;
    detail: string;
  };
  overall: "ready" | "blocked" | "collecting";
  nextAction: string;
}

export function computeMeasurementReadiness(input: {
  revenueCatConnected: boolean;
  revenueCatHasData: boolean;
  posthogConnected: boolean;
  mappingStatus: string | null;
  sessionEvent: string;
  activationEvent: string;
  versionProperty: string;
  versionPropertyStatus: string;
}): MeasurementReadiness {
  const money: MeasurementReadiness["money"] = !input.revenueCatConnected
    ? {
        status: "missing",
        label: "Money source",
        detail: "Connect RevenueCat (read-only charts).",
      }
    : input.revenueCatHasData
      ? {
          status: "ready",
          label: "Money source",
          detail: "RevenueCat is connected and delivering metrics.",
        }
      : {
          status: "collecting",
          label: "Money source",
          detail: "RevenueCat connected — waiting for the first metric import.",
        };

  const mappingConfirmed =
    input.mappingStatus === "confirmed" || input.mappingStatus === "manual";
  const hasEvents =
    Boolean(input.sessionEvent) && Boolean(input.activationEvent);

  const activation: MeasurementReadiness["activation"] = !input.posthogConnected
    ? {
        status: "missing",
        label: "Activation source",
        detail: "Connect PostHog and confirm session + activation events.",
      }
    : !hasEvents
      ? {
          status: "blocked",
          label: "Activation source",
          detail: "PostHog is connected but session/activation events are not set.",
        }
      : !mappingConfirmed
        ? {
            status: "blocked",
            label: "Activation source",
            detail: "Confirm the PostHog session and activation mapping.",
          }
        : {
            status: "ready",
            label: "Activation source",
            detail: `${input.sessionEvent} → ${input.activationEvent}`,
          };

  const versionConfirmed = input.versionPropertyStatus === "confirmed";
  const version: MeasurementReadiness["version"] = !input.posthogConnected
    ? {
        status: "missing",
        label: "Release version",
        detail: "Connect PostHog to discover a version property.",
      }
    : !input.versionProperty
      ? {
          status: "blocked",
          label: "Release version",
          detail:
            "Confirm which PostHog property holds the app version (e.g. $app_version).",
        }
      : !versionConfirmed
        ? {
            status: "blocked",
            label: "Release version",
            detail: `Candidate ${input.versionProperty} is unconfirmed — confirm it before evaluation.`,
          }
        : {
            status: "ready",
            label: "Release version",
            detail: `Using confirmed property ${input.versionProperty}.`,
          };

  const statuses = [money.status, activation.status, version.status];
  let overall: MeasurementReadiness["overall"] = "ready";
  if (statuses.includes("missing") || statuses.includes("blocked")) {
    overall = "blocked";
  } else if (statuses.includes("collecting")) {
    overall = "collecting";
  }

  let nextAction = "Waiting for the next mature release cohort.";
  if (money.status === "missing") {
    nextAction = "Connect RevenueCat in Settings.";
  } else if (activation.status === "missing") {
    nextAction = "Connect PostHog in Settings.";
  } else if (activation.status === "blocked") {
    nextAction = "Confirm session and activation events in Settings.";
  } else if (version.status === "blocked" || version.status === "missing") {
    nextAction = "Discover and confirm the version property in Settings.";
  } else if (money.status === "collecting") {
    nextAction = "Wait for RevenueCat metrics, then refresh.";
  }

  return { money, activation, version, overall, nextAction };
}
