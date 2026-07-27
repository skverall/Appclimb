/**
 * Canonical website install state model (Decision System V2, Task P0.24).
 *
 * This module is deliberately framework-free so the Cloudflare API worker and
 * the Next.js client derive the same status from the same facts. A saved domain
 * is NOT a connected source: nothing here reports `Tracking installed` before a
 * real browser event was accepted by the collector.
 */

/** Bumped whenever the emitted snippet contract changes. */
export const TRACKING_INSTALL_VERSION = 1;

/** A property counts as `Live` while a real event landed inside this window. */
export const LIVE_WINDOW_MS = 30 * 60 * 1000;

/** Verified installs that stop reporting for this long are reported as stale. */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Sample floor before conversion/acquisition diagnosis is honest. */
export const BASELINE_TARGET_SESSIONS = 40;
export const BASELINE_TARGET_DAYS = 3;

export type WebInstallStatus =
  | "domain_saved"
  | "awaiting_deploy"
  | "listening"
  | "first_event_verified"
  | "collecting"
  | "ready"
  | "stale"
  | "error";

export type WebInstallStep =
  | "domain"
  | "install"
  | "deploy"
  | "verify"
  | "goal"
  | "baseline";

export const WEB_INSTALL_STEPS: readonly WebInstallStep[] = [
  "domain",
  "install",
  "deploy",
  "verify",
  "goal",
  "baseline",
] as const;

export const WEB_INSTALL_STEP_TITLES: Record<WebInstallStep, string> = {
  domain: "Add domain",
  install: "Install tracking",
  deploy: "Deploy and open site",
  verify: "Verify first real event",
  goal: "Configure conversion goal",
  baseline: "Collect baseline",
};

/**
 * Copy discipline from Task P0.24. `Tracking installed` may only appear once a
 * real event was accepted; `Ready for diagnosis` only after a usable sample.
 */
export const WEB_INSTALL_STATUS_LABELS: Record<WebInstallStatus, string> = {
  domain_saved: "Website saved",
  awaiting_deploy: "Waiting for deploy",
  listening: "Listening for first event",
  first_event_verified: "Tracking installed",
  collecting: "Collecting baseline",
  ready: "Ready for diagnosis",
  stale: "No recent events",
  error: "Collector error",
};

export const WEB_INSTALL_STATUS_DESCRIPTIONS: Record<WebInstallStatus, string> =
  {
    domain_saved:
      "The domain is saved. It is not a connected source until AppClimb accepts a real event from a browser on that domain.",
    awaiting_deploy:
      "The install was handed off but no event has arrived. Deploy the change to the live site, then open a page once.",
    listening:
      "Watching the collector for the first real browser event from this domain.",
    first_event_verified:
      "A real browser event was accepted. Acquisition collection is running; charts stay empty until traffic arrives.",
    collecting:
      "Real events are arriving. AppClimb is building the baseline it needs before it will claim a bottleneck.",
    ready: "Enough real traffic has been collected to run a web diagnosis.",
    stale:
      "This property was verified before, but no recent events arrived. The script may have been removed or the site is not being visited.",
    error:
      "The collector rejected the last attempt. Nothing is being recorded for this property right now.",
  };

export type ConversionGoalKind =
  | "signup"
  | "checkout_started"
  | "subscription_started"
  | "custom";

export const CONVERSION_GOAL_PRESETS: ReadonlyArray<{
  kind: Exclude<ConversionGoalKind, "custom">;
  goal: string;
  label: string;
  description: string;
}> = [
  {
    kind: "signup",
    goal: "account_created",
    label: "Signup",
    description: "A visitor creates an account.",
  },
  {
    kind: "checkout_started",
    goal: "checkout_started",
    label: "Checkout started",
    description: "A visitor opens checkout or the payment step.",
  },
  {
    kind: "subscription_started",
    goal: "subscription_started",
    label: "Subscription started",
    description: "A visitor starts a paid subscription or trial.",
  },
] as const;

export interface WebInstallFacts {
  /** Absent until step 1 saved the property. */
  propertyId?: string | null;
  domain?: string | null;
  firstEventAt?: string | null;
  lastEventAt?: string | null;
  verifiedAt?: string | null;
  verifiedHostname?: string | null;
  installationVersion?: number | null;
  primaryConversionGoal?: string | null;
  /**
   * Distinct sessions in the baseline window. `null`/`undefined` means "not
   * measured yet" and must never be rendered as zero.
   */
  baselineSessions?: number | null;
  /** Distinct days with at least one real event. Same missing-vs-zero rule. */
  baselineDays?: number | null;
  /** Furthest wizard step the user reached, persisted server-side. */
  reachedStep?: WebInstallStep | null;
  /** True while the wizard is actively polling for the first event. */
  listening?: boolean;
  errorCode?: string | null;
}

export interface WebInstallBaseline {
  sessions: number | null;
  days: number | null;
  targetSessions: number;
  targetDays: number;
  /** null while the sample size is unknown — a missing metric is not zero. */
  progress: number | null;
}

export interface WebInstallState {
  status: WebInstallStatus;
  label: string;
  description: string;
  step: WebInstallStep;
  stepIndex: number;
  stepTitle: string;
  propertySaved: boolean;
  /** Only true after a real accepted browser event. */
  trackingInstalled: boolean;
  /** Only true while a real event landed recently. */
  live: boolean;
  readyForDiagnosis: boolean;
  /** Acquisition analysis still works; conversion diagnosis does not. */
  conversionDiagnosisBlocked: boolean;
  baseline: WebInstallBaseline;
  /** True once the wizard has nothing incomplete left. */
  complete: boolean;
  /** Pulse/app-tab label, or null when there is nothing to resume. */
  resumeLabel: string | null;
  errorCode: string | null;
}

function stepIndex(step: WebInstallStep | null | undefined): number {
  if (!step) return 0;
  const index = WEB_INSTALL_STEPS.indexOf(step);
  return index < 0 ? 0 : index;
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/**
 * Derives the single truthful install state. Callers pass only observed facts;
 * this function never invents traffic and never upgrades a saved domain to a
 * connected source.
 */
export function deriveWebInstallState(
  facts: WebInstallFacts,
  now: Date = new Date(),
): WebInstallState {
  const propertySaved = Boolean(facts.propertyId);
  const firstEventAt = timestamp(facts.firstEventAt);
  const lastEventAt = timestamp(facts.lastEventAt) ?? firstEventAt;
  const trackingInstalled = propertySaved && firstEventAt !== null;
  const sessions = positive(facts.baselineSessions);
  const days = positive(facts.baselineDays);
  const goal = (facts.primaryConversionGoal ?? "").trim();
  const reached = stepIndex(facts.reachedStep);
  const nowMs = now.getTime();

  const live =
    trackingInstalled &&
    lastEventAt !== null &&
    nowMs - lastEventAt <= LIVE_WINDOW_MS;
  const stale =
    trackingInstalled &&
    lastEventAt !== null &&
    nowMs - lastEventAt > STALE_AFTER_MS;
  const sampleReady =
    sessions !== null &&
    days !== null &&
    sessions >= BASELINE_TARGET_SESSIONS &&
    days >= BASELINE_TARGET_DAYS;

  // Resolve the exact incomplete step: the furthest step the user reached,
  // floored by what the server can prove and capped by what is possible.
  let step: WebInstallStep;
  if (!propertySaved) {
    step = "domain";
  } else if (!trackingInstalled) {
    const capped = Math.min(Math.max(reached, 1), stepIndex("verify"));
    step = WEB_INSTALL_STEPS[capped];
  } else if (!goal) {
    // The verified-event step is not skipped: the user must be able to see the
    // accepted event before being asked for a conversion goal.
    const capped = Math.min(
      Math.max(reached, stepIndex("verify")),
      stepIndex("goal"),
    );
    step = WEB_INSTALL_STEPS[capped];
  } else {
    step = "baseline";
  }

  let status: WebInstallStatus;
  if (facts.errorCode) {
    status = "error";
  } else if (!trackingInstalled) {
    status = facts.listening
      ? "listening"
      : reached >= stepIndex("deploy")
        ? "awaiting_deploy"
        : "domain_saved";
  } else if (stale) {
    status = "stale";
  } else if (sampleReady) {
    status = "ready";
  } else if (sessions === null) {
    // Sample size unknown. Report the one thing that is proven.
    status = "first_event_verified";
  } else if (goal || reached >= stepIndex("goal")) {
    status = "collecting";
  } else {
    status = "first_event_verified";
  }

  const progress =
    sessions === null || days === null
      ? null
      : Math.min(
          1,
          (Math.min(sessions / BASELINE_TARGET_SESSIONS, 1) +
            Math.min(days / BASELINE_TARGET_DAYS, 1)) /
            2,
        );

  const complete = status === "ready" && Boolean(goal);

  return {
    status,
    label: WEB_INSTALL_STATUS_LABELS[status],
    description: WEB_INSTALL_STATUS_DESCRIPTIONS[status],
    step,
    stepIndex: stepIndex(step),
    stepTitle: WEB_INSTALL_STEP_TITLES[step],
    propertySaved,
    trackingInstalled,
    live,
    readyForDiagnosis: status === "ready",
    conversionDiagnosisBlocked: !goal,
    baseline: {
      sessions,
      days,
      targetSessions: BASELINE_TARGET_SESSIONS,
      targetDays: BASELINE_TARGET_DAYS,
      progress,
    },
    complete,
    resumeLabel: complete ? null : resumeLabelFor(status, propertySaved),
    errorCode: facts.errorCode ?? null,
  };
}

function resumeLabelFor(
  status: WebInstallStatus,
  propertySaved: boolean,
): string {
  if (!propertySaved) return "Add your website";
  if (status === "stale") return "Reconnect website tracking";
  if (status === "error") return "Fix website tracking";
  return "Continue website setup";
}

/** Canonical hostname for step 1. Returns "" when the input is not usable. */
export function canonicalHostname(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//u, "");
  const host = withoutScheme.split(/[/?#]/u)[0]?.split("@").pop() ?? "";
  const withoutPort = host.split(":")[0] ?? "";
  const normalized = withoutPort.replace(/\.$/u, "").replace(/^www\./u, "");
  if (!normalized) return "";
  if (normalized === "localhost") return normalized;
  if (normalized.length < 3 || normalized.length > 253) return "";
  if (!normalized.includes(".")) return "";
  if (!/^[a-z0-9.-]+$/u.test(normalized)) return "";
  if (normalized.startsWith(".") || normalized.includes("..")) return "";
  const tld = normalized.split(".").pop() ?? "";
  if (tld.length < 2 || /^\d+$/u.test(tld)) return "";
  return normalized;
}
