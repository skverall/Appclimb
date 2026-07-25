import { AppClimbShell } from "@/components/app-climb-shell";
import type { DashboardSnapshot, DataState } from "@/lib/contracts";
import {
  type BackendIdentity,
  readBackend,
} from "@/lib/backend";
import { demoSnapshot } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

interface GrowthEnvelope {
  data?: DashboardSnapshot;
  meta?: {
    mode?: "empty" | "partial" | "live";
    dataState?: DataState;
  };
}

interface IdentityEnvelope {
  data?: BackendIdentity;
}

function isSnapshot(value: unknown): value is DashboardSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<DashboardSnapshot>;
  return (
    typeof snapshot.workspaceName === "string" &&
    Array.isArray(snapshot.stages) &&
    Array.isArray(snapshot.sources)
  );
}

export default async function Home() {
  let snapshot: DashboardSnapshot = { ...demoSnapshot, mode: "demo" };
  let session: BackendIdentity | undefined;

  try {
    const [growthResponse, identityResponse] = await Promise.all([
      readBackend("/v1/growth-map"),
      readBackend("/v1/me"),
    ]);

    if (identityResponse?.ok) {
      session = ((await identityResponse.json()) as IdentityEnvelope).data;
    }

    if (growthResponse?.ok) {
      const payload = (await growthResponse.json()) as GrowthEnvelope;
      if (isSnapshot(payload.data)) {
        const mode = payload.meta?.mode ?? "live";
        // Honest data state: a workspace with no data, stale data, or low
        // volume renders the backend snapshot directly (which may have empty
        // stages/insights/evidence) instead of overlaying the demo funnel.
        // The demo fallback only applies when the backend is unreachable,
        // which leaves `snapshot` as demoSnapshot from the initial value above.
        snapshot = {
          ...payload.data,
          mode,
          dataState: payload.meta?.dataState,
        };
      }
    }
    // If growthResponse is missing or not ok, snapshot stays as the public
    // demo — preserving the demo landing page for unauthenticated visitors
    // and during a temporary backend outage.
  } catch {
    // The public demo stays available during a temporary backend outage.
  }

  return (
    <AppClimbShell
      initialSnapshot={snapshot}
      session={session}
      trialDaysRemaining={
        session
          ? Math.max(
              0,
              Math.ceil(
                (new Date(session.trialEndsAt).getTime() -
                  new Date(snapshot.generatedAt).getTime()) /
                  (24 * 60 * 60 * 1000),
              ),
            )
          : undefined
      }
    />
  );
}
