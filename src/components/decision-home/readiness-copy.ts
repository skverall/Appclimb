import type { SourceProvider, WorkspaceReadiness } from "@/lib/contracts";

export type ReadinessState = WorkspaceReadiness["state"];
export type PrimaryActionKind = WorkspaceReadiness["primaryAction"]["kind"];

/** Human label for a provider. Never invents a name for an unknown value. */
export function providerLabel(provider?: SourceProvider | string): string {
  switch (provider) {
    case "app-store-connect":
      return "App Store Connect";
    case "revenuecat":
      return "RevenueCat";
    case "posthog":
      return "PostHog";
    case "superwall":
      return "Superwall";
    case "appclimb-rank":
      return "Keyword monitor";
    default:
      return provider ? humanizeCode(provider) : "";
  }
}

/** Fallback for a code we have no explicit copy for. Never fabricates detail. */
export function humanizeCode(code: string): string {
  const spaced = code.replace(/[_-]+/gu, " ").trim();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface AttentionCause {
  /** Short, exact cause name. */
  title: string;
  /** What AppClimb actually observed. */
  detail: string;
  /** Label of the CTA that fixes this exact cause. */
  ctaLabel: string;
}

/**
 * Readiness state G. The plan requires the exact cause to be named — never a
 * generic "something went wrong". Unknown codes are surfaced verbatim so the
 * user can quote them to support instead of seeing invented copy.
 */
export function attentionCause(
  reasonCode: string,
  provider?: SourceProvider,
): AttentionCause {
  const name = providerLabel(provider) || "This source";

  switch (reasonCode) {
    case "invalid_credentials":
    case "invalid_credentials_payload":
    case "invalid_apple_private_key":
    case "invalid_credential_envelope":
      return {
        title: "Authorization is no longer valid",
        detail: `${name} rejected the stored credentials. Re-enter them to resume syncing.`,
        ctaLabel: `Re-authorize ${name}`,
      };

    case "invalid_access_token":
    case "invalid_refresh_token":
    case "expired":
    case "authorization_expired":
      return {
        title: "Authorization expired",
        detail: `${name} revoked or expired the access token AppClimb was using. Reconnect to issue a new one.`,
        ctaLabel: `Reconnect ${name}`,
      };

    case "invalid_posthog_host":
    case "invalid_provider_host":
    case "wrong_project":
    case "posthog_project_mismatch":
      return {
        title: "Connected to the wrong project",
        detail: `The ${name} project bound to this workspace does not match the product you are diagnosing. Re-select the correct project.`,
        ctaLabel: "Choose the correct project",
      };

    case "posthog_event_not_found":
    case "no_events":
    case "insufficient_events":
      return {
        title: "No events received",
        detail: `${name} is authorized but has not returned a single usable event. Check that your product is sending events to this project.`,
        ctaLabel: "Review event mapping",
      };

    case "apple_reports_role_required":
      return {
        title: "Apple role missing",
        detail:
          "The App Store Connect key does not hold a role that can read Analytics Reports. Grant the Admin or Analytics role to this key in App Store Connect.",
        ctaLabel: "Fix App Store Connect access",
      };

    case "apple_report_request_required":
      return {
        title: "Apple report request not accepted",
        detail:
          "Apple has not accepted an ongoing Analytics Report request for this app yet. AppClimb needs an accepted request before files can arrive.",
        ctaLabel: "Request Apple reports",
      };

    case "script_not_deployed":
    case "script_not_verified":
    case "web_tracking_unverified":
      return {
        title: "Tracking script is not live",
        detail:
          "AppClimb has never accepted a real event from this domain, so the script is not deployed or not reachable on the pages you expect.",
        ctaLabel: "Open install wizard",
      };

    case "stale_source":
    case "source_stale":
      return {
        title: "Source data is stale",
        detail: `${name} has not delivered fresh data inside the current window, so any diagnosis would describe an old period.`,
        ctaLabel: `Re-sync ${name}`,
      };

    case "invalid_apple_report":
    case "invalid_provider_response":
    case "import_failed":
    case "sync_failed":
      return {
        title: "Import failed",
        detail: `The last ${name} import did not complete, so no new metrics were written for this window.`,
        ctaLabel: "Retry import",
      };

    case "provider_unavailable":
      return {
        title: "Provider is unreachable",
        detail: `${name} did not respond to the last sync attempt. AppClimb will retry, and you can force a retry now.`,
        ctaLabel: "Retry now",
      };

    case "source_not_connected":
      return {
        title: "Source is no longer connected",
        detail: `${name} was removed or never finished connecting.`,
        ctaLabel: `Connect ${name}`,
      };

    default:
      return {
        title: humanizeCode(reasonCode) || "Source error",
        detail: `${name} reported the error code "${reasonCode}". Reconnect the source, or quote this code to support.`,
        ctaLabel: `Open ${name || "source"} settings`,
      };
  }
}

/** Readable label for a readiness blocker code. */
export function blockerLabel(code: string): string {
  switch (code) {
    case "product_missing":
      return "No real product added";
    case "web_tracking_unverified":
      return "Tracking script not verified";
    case "app_store_connect_missing":
      return "App Store Connect not connected";
    case "apple_reports_pending":
      return "Apple reports still processing";
    case "insufficient_baseline_days":
      return "Baseline still collecting";
    default:
      if (code.startsWith("source_attention_")) {
        return `${providerLabel(code.slice("source_attention_".length))} needs attention`;
      }
      return humanizeCode(code);
  }
}

/** Readable label for a capability reason code. */
export function capabilityReason(code?: string): string {
  if (!code) return "";
  switch (code) {
    case "setup_required":
      return "Setup not finished";
    case "connect_acquisition_source":
      return "Needs App Store Connect";
    case "connect_posthog":
      return "Needs PostHog";
    case "connect_revenuecat_or_superwall":
      return "Needs RevenueCat or Superwall";
    case "connect_retention_source":
      return "Needs RevenueCat or PostHog";
    default:
      return humanizeCode(code);
  }
}
