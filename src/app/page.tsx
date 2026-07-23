import { AppClimbShell } from "@/components/app-climb-shell";
import type { DashboardSnapshot } from "@/lib/contracts";
import {
  type BackendIdentity,
  readBackend,
} from "@/lib/backend";
import { demoSnapshot } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

interface GrowthEnvelope {
  data?: DashboardSnapshot;
  meta?: { mode?: "empty" | "live" };
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
  let snapshot = demoSnapshot;
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
        snapshot =
          payload.meta?.mode === "live"
            ? { ...payload.data, mode: "live" }
            : {
                ...demoSnapshot,
                generatedAt: payload.data.generatedAt,
                workspaceName: payload.data.workspaceName,
                app: payload.data.app,
                confidence: payload.data.confidence,
                sources: payload.data.sources,
                mode: "demo",
              };
      }
    }
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
