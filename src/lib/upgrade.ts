/**
 * What the upgrade dialog says, and why it opened.
 *
 * Every Pro entry point passes a reason, so the dialog leads with the limit
 * the visitor just met instead of a generic pitch, and the funnel can tell
 * which trigger turns into checkouts. Shared by client components only; no
 * server imports.
 */

import { GUEST_EXPLORER_CHECKS_PER_DAY, PLAN_LIMITS } from "./plan";

export type BillingCycle = "monthly" | "yearly";

export type UpgradeReason =
  | "default"
  | "checks"
  | "apps"
  | "keywords"
  | "history"
  | "sync"
  | "assistant";

/** Pro feature rows, in the order the dialog lists them. */
export type ProFeatureId = "checks" | "history" | "apps" | "ranks" | "sync" | "email" | "assistant";

export interface UpgradeCopy {
  headline: string;
  body: string;
  /** Free → Pro for the limit this reason is about. */
  compare: { label: string; free: string; pro: string; freeShare: number };
  /** The feature row to highlight and list first. */
  feature: ProFeatureId;
}

const free = PLAN_LIMITS.free;
const pro = PLAN_LIMITS.pro;

export const PRO_FEATURE_LABELS: Record<ProFeatureId, string> = {
  checks: "Unlimited keyword checks",
  history: `${pro.historyWeeks} weeks of Apple popularity history`,
  apps: "Unlimited apps & keywords in My Apps",
  ranks: `${pro.historyDays} days of rank history`,
  sync: "Cloud sync across devices",
  email: "Weekly email: what changed for your keywords",
  assistant: `${pro.aiMessagesPerDay} AI assistant messages / day`,
};

const FEATURE_ORDER: ProFeatureId[] = ["checks", "history", "apps", "ranks", "sync", "email", "assistant"];

export const UPGRADE_COPY: Record<UpgradeReason, UpgradeCopy> = {
  default: {
    headline: "Find the keywords you can actually win",
    body: "Pro lifts every daily limit, keeps a full year of Apple’s history, and syncs your work to every device.",
    compare: { label: "Keyword checks a day", free: String(free.explorerChecksPerDay), pro: "Unlimited", freeShare: 0.3 },
    feature: "checks",
  },
  checks: {
    headline: "You’ve used today’s free checks",
    body: "Keep researching right now. Pro checks as many new keywords as you like, every day — no waiting until tomorrow.",
    compare: { label: "Keyword checks a day", free: String(free.explorerChecksPerDay), pro: "Unlimited", freeShare: 0.3 },
    feature: "checks",
  },
  apps: {
    headline: "Track every app you ship",
    body: `Free tracks ${free.trackedApps} app. Pro tracks all of them, in every storefront, with ${pro.historyDays} days of daily ranks.`,
    compare: { label: "Tracked apps", free: String(free.trackedApps), pro: "Unlimited", freeShare: 0.12 },
    feature: "apps",
  },
  keywords: {
    headline: "Track every keyword that matters",
    body: `Free tracks ${free.keywordsPerApp} keywords per app. Pro removes the cap, so the long tail you rank for stays in view.`,
    compare: { label: "Keywords per app", free: String(free.keywordsPerApp), pro: "Unlimited", freeShare: 0.25 },
    feature: "apps",
  },
  history: {
    headline: "See a full year of Apple’s history",
    body: `Spot seasonality before you commit. A term that spikes every December looks flat in a ${free.historyWeeks}-week window.`,
    compare: {
      label: "Apple popularity history",
      free: `${free.historyWeeks} weeks`,
      pro: `${pro.historyWeeks} weeks`,
      freeShare: free.historyWeeks / pro.historyWeeks,
    },
    feature: "history",
  },
  sync: {
    headline: "Your keywords, on every device",
    body: "Pro syncs tracked apps, keywords, and history to your account — nothing lives in just one browser.",
    compare: { label: "Where your data lives", free: "This browser", pro: "Every device", freeShare: 0.2 },
    feature: "sync",
  },
  assistant: {
    headline: "Keep the ASO assistant going",
    body: `Free includes ${free.aiMessagesPerDay} messages a day. Pro gives you ${pro.aiMessagesPerDay}, each grounded in Apple’s own popularity data.`,
    compare: {
      label: "Assistant messages a day",
      free: String(free.aiMessagesPerDay),
      pro: String(pro.aiMessagesPerDay),
      freeShare: 0.08,
    },
    feature: "assistant",
  },
};

export function upgradeCopy(reason: UpgradeReason): UpgradeCopy {
  return UPGRADE_COPY[reason] ?? UPGRADE_COPY.default;
}

/** Pro features with the one this reason is about moved to the front. */
export function orderedProFeatures(reason: UpgradeReason): ProFeatureId[] {
  const lead = upgradeCopy(reason).feature;
  return [lead, ...FEATURE_ORDER.filter((id) => id !== lead)];
}

export function isUpgradeReason(value: unknown): value is UpgradeReason {
  return typeof value === "string" && Object.hasOwn(UPGRADE_COPY, value);
}

/** Guest copy for the step before checkout, kept next to the dialog copy. */
export const GUEST_UPGRADE_NOTE = `Checkout needs a free account so Pro attaches to you. It takes a few seconds — and lifts guest checks from ${GUEST_EXPLORER_CHECKS_PER_DAY} to ${free.explorerChecksPerDay} a day right away.`;

/* --------------------------------------------------------------------------
   Upgrade intent that survives sign-in
   --------------------------------------------------------------------------
   A guest who clicks "upgrade" must sign in first (Google redirect or a magic
   link, possibly in another tab). Remember what they were buying so the
   dialog reopens on their return instead of dropping them on the homepage.
*/

export const PENDING_UPGRADE_KEY = "appclimb:upgrade:pending:v1";
/** Long enough to find a magic-link email, short enough to not surprise. */
export const PENDING_UPGRADE_TTL_MS = 2 * 60 * 60 * 1000;

export interface PendingUpgrade {
  cycle: BillingCycle;
  reason: UpgradeReason;
}

export function savePendingUpgrade(storage: Storage, pending: PendingUpgrade, now: number = Date.now()): void {
  try {
    storage.setItem(PENDING_UPGRADE_KEY, JSON.stringify({ ...pending, at: now }));
  } catch {
    // Storage unavailable: the visitor simply reopens the dialog themselves.
  }
}

export function clearPendingUpgrade(storage: Storage): void {
  try {
    storage.removeItem(PENDING_UPGRADE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

/** Read and remove a pending upgrade; stale or malformed entries return null. */
export function takePendingUpgrade(storage: Storage, now: number = Date.now()): PendingUpgrade | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(PENDING_UPGRADE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  clearPendingUpgrade(storage);
  try {
    const parsed = JSON.parse(raw) as { cycle?: unknown; reason?: unknown; at?: unknown };
    if (typeof parsed.at !== "number" || !Number.isFinite(parsed.at)) return null;
    if (now - parsed.at > PENDING_UPGRADE_TTL_MS || parsed.at > now + 60_000) return null;
    const cycle: BillingCycle = parsed.cycle === "monthly" ? "monthly" : "yearly";
    const reason = isUpgradeReason(parsed.reason) ? parsed.reason : "default";
    return { cycle, reason };
  } catch {
    return null;
  }
}
