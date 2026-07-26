import { AppClimbShell } from "@/components/app-climb-shell";
import type { Metadata } from "next";
import type { DashboardSnapshot } from "@/lib/contracts";
import {
  backendSessionPresence,
  type BackendIdentity,
  readBackend,
} from "@/lib/backend";
import { demoSnapshot } from "@/lib/demo-data";
import { isDashboardSnapshot } from "@/lib/dashboard-schema";
import { isBackendIdentity } from "@/lib/identity-schema";
import {
  workspaceInsightFromValue,
  workspaceSectionFromValue,
} from "@/lib/workspace-navigation";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AppClimb — Visual growth diagnosis for iOS subscription apps",
  description:
    "Explore an interactive River Atlas demo that maps acquisition, activation, paywall, subscription, and retention evidence into one growth journey.",
  alternates: {
    canonical: "/",
  },
};

interface GrowthEnvelope {
  data?: DashboardSnapshot;
  meta?: {
    mode?: "empty" | "live";
    entitled?: boolean;
    entitlementError?: string;
  };
}

interface IdentityEnvelope {
  data?: unknown;
}

function unavailableSnapshot(identity?: BackendIdentity): DashboardSnapshot {
  return {
    ...demoSnapshot,
    mode: "unavailable",
    generatedAt: new Date().toISOString(),
    workspaceName: identity?.workspaceName ?? "Private workspace",
    app: {
      id: "",
      name: "Your iOS app",
      platform: "iOS",
      storefront: "Unavailable",
      period: "Unavailable",
    },
    confidence: {
      score: 0,
      level: "low",
      note: "The growth map could not be loaded.",
    },
    stages: demoSnapshot.stages.map((stage) => ({
      ...stage,
      value: 0,
      formattedValue: "—",
      conversionRate: null,
      health: "unknown",
      evidenceIds: [],
      flowWidth: 24,
      benchmark: undefined,
    })),
    events: [],
    evidence: [],
    insights: [],
    actionProposals: [],
    experiments: [],
    sources: [],
    retention: [],
    customerClusters: [],
  };
}

async function currentTimestamp() {
  return Date.now();
}

function trialDaysRemaining(trialEndsAt: string, renderedAt: number) {
  const trialEnd = Date.parse(trialEndsAt);
  if (!Number.isFinite(trialEnd)) return undefined;
  return Math.max(
    0,
    Math.ceil((trialEnd - renderedAt) / (24 * 60 * 60 * 1000)),
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const renderedAt = await currentTimestamp();
  const forceDemo = resolvedSearchParams.demo === "1";
  const authRecoveryUnavailable =
    resolvedSearchParams.auth === "unavailable";
  const sessionPresence = await backendSessionPresence();
  const privateSessionExpected =
    sessionPresence.hasAccessToken || sessionPresence.hasRefreshToken;
  const returnParams = new URLSearchParams();
  for (const key of ["view", "insight", "demo", "atlas", "app"]) {
    const value = resolvedSearchParams[key];
    if (typeof value === "string") returnParams.set(key, value);
  }
  const returnPath = `/${returnParams.size > 0 ? `?${returnParams}` : ""}`;

  if (
    !sessionPresence.hasAccessToken &&
    sessionPresence.hasRefreshToken &&
    !authRecoveryUnavailable
  ) {
    redirect(`/api/auth/refresh?next=${encodeURIComponent(returnPath)}`);
  }

  let snapshot = demoSnapshot;
  let session: BackendIdentity | undefined;
  let authenticatedSnapshotLoaded = false;

  const [growthResult, identityResult] = await Promise.allSettled([
    readBackend(
      `/v1/growth-map${
        typeof resolvedSearchParams.app === "string"
          ? `?appId=${encodeURIComponent(resolvedSearchParams.app)}`
          : ""
      }`,
    ),
    readBackend("/v1/me"),
  ]);
  const growthResponse =
    growthResult.status === "fulfilled" ? growthResult.value : null;
  const identityResponse =
    identityResult.status === "fulfilled" ? identityResult.value : null;

  try {
    if (identityResponse?.ok) {
      const identityPayload = (await identityResponse.json()) as IdentityEnvelope;
      if (isBackendIdentity(identityPayload.data)) {
        session = identityPayload.data;
      }
    }

    if (growthResponse?.ok) {
      const payload = (await growthResponse.json()) as GrowthEnvelope;
      if (isDashboardSnapshot(payload.data)) {
        snapshot = {
          ...payload.data,
          mode:
            payload.meta?.entitled === false
              ? "restricted"
              : payload.meta?.mode === "live"
                ? "live"
                : "empty",
        };
        authenticatedSnapshotLoaded = true;
      }
    }
  } catch {
    // A public visitor still receives the demo. Authenticated workspaces get
    // an explicit unavailable state below instead of synthetic metrics.
  }

  if (
    privateSessionExpected &&
    identityResponse?.status === 401 &&
    !authRecoveryUnavailable
  ) {
    redirect(`/api/auth/refresh?next=${encodeURIComponent(returnPath)}`);
  }

  if (
    !forceDemo &&
    privateSessionExpected &&
    (!authenticatedSnapshotLoaded || !session)
  ) {
    snapshot = unavailableSnapshot(session);
  }

  if (forceDemo) {
    snapshot = demoSnapshot;
  }

  const initialSection = workspaceSectionFromValue(
    resolvedSearchParams.view,
  );
  const initialInsightId = workspaceInsightFromValue(
    resolvedSearchParams.insight,
    snapshot.insights.map((insight) => insight.id),
  );

  return (
    <AppClimbShell
      initialSnapshot={snapshot}
      initialSection={initialSection}
      initialInsightId={initialInsightId}
      initialPulseProjection={
        resolvedSearchParams.atlas === "1" ? "acquisition" : "growth"
      }
      session={session}
      privateSessionExpected={privateSessionExpected}
      trialDaysRemaining={
        session
          ? trialDaysRemaining(session.trialEndsAt, renderedAt)
          : undefined
      }
    />
  );
}
