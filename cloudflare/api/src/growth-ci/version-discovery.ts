/**
 * Live PostHog version-property discovery for Growth CI.
 * Results are suggestions only — confirmation is required before evaluation.
 */
import {
  discoverPostHogEvents,
  type PostHogEventOption,
} from "../aggregates";
import { openCredentials, type CredentialEnvelope } from "../crypto";
import { ProviderError } from "../connectors";
import { requireSecret } from "../runtime";
import {
  isSafePropertyKey,
  rankVersionPropertyCandidates,
  type PropertyObservation,
  type VersionPropertyCandidate,
} from "../release-impact/version-property";

const maxProviderResponse = 2 * 1024 * 1024;

const PROBE_KEYS = [
  "$app_version",
  "app_version",
  "appVersion",
  "version",
  "build_number",
  "buildNumber",
  "$app_build",
  "build",
];

function required(credentials: Record<string, unknown>, key: string): string {
  const value = credentials[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderError("invalid_credentials_payload", 400);
  }
  return value.trim();
}

function quoteEvent(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function providerJSON(
  endpoint: string,
  token: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (text.length > maxProviderResponse) {
    throw new ProviderError("provider_response_too_large", 502, true);
  }
  if (!response.ok) {
    throw new ProviderError(
      response.status === 401 || response.status === 403
        ? "provider_unauthorized"
        : "provider_unavailable",
      response.status === 401 || response.status === 403 ? 401 : 502,
      response.status >= 500 || response.status === 429,
    );
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ProviderError("invalid_provider_payload", 502, true);
  }
}

/**
 * Probe known version-like keys on the confirmed session event.
 * Also samples recent event property maps for additional candidates.
 */
export async function discoverVersionPropertyCandidates(
  credentials: Record<string, unknown>,
  sessionEvent: string,
): Promise<{
  candidates: VersionPropertyCandidate[];
  sessionEvent: string;
  eventsSampled: number;
}> {
  if (!sessionEvent || sessionEvent.length > 200) {
    return { candidates: [], sessionEvent: "", eventsSampled: 0 };
  }
  const apiKey = required(credentials, "personalApiKey");
  const projectId = required(credentials, "projectId");
  const host = required(credentials, "host").replace(/\/+$/u, "");
  if (!["https://us.posthog.com", "https://eu.posthog.com"].includes(host)) {
    throw new ProviderError("invalid_posthog_host", 400);
  }

  const safeKeys = PROBE_KEYS.filter(isSafePropertyKey);
  const countExprs = safeKeys
    .map(
      (key, index) =>
        `countIf(notEmpty(toString(properties.${key}))) as c_${index}`,
    )
    .join(",\n  ");
  const sampleExprs = safeKeys
    .map(
      (key, index) =>
        `groupUniqArray(10)(if(notEmpty(toString(properties.${key})), toString(properties.${key}), NULL)) as s_${index}`,
    )
    .join(",\n  ");

  const probeQuery = `select
  count() as total_events,
  ${countExprs},
  ${sampleExprs}
from events
where timestamp >= now() - interval 30 day
  and event = ${quoteEvent(sessionEvent)}
limit 1`;

  let probePayload: Record<string, unknown> = {};
  try {
    probePayload = await providerJSON(
      `${host}/api/projects/${encodeURIComponent(projectId)}/query/`,
      apiKey,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: { kind: "HogQLQuery", query: probeQuery },
        }),
      },
    );
  } catch {
    // Fall through with empty observations
  }

  const row = (Array.isArray(probePayload.results)
    ? probePayload.results
    : []
  ).find((candidate) => Array.isArray(candidate)) as unknown[] | undefined;

  const totalEvents =
    row && typeof row[0] === "number" ? Math.max(0, Math.trunc(row[0])) : 0;
  const observations: PropertyObservation[] = [];

  for (let index = 0; index < safeKeys.length; index += 1) {
    const countOffset = 1 + index;
    const sampleOffset = 1 + safeKeys.length + index;
    const count =
      row && typeof row[countOffset] === "number"
        ? Math.max(0, Math.trunc(row[countOffset] as number))
        : 0;
    if (count <= 0) continue;
    const rawSamples = row?.[sampleOffset];
    const sampleValues = Array.isArray(rawSamples)
      ? rawSamples
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.slice(0, 40))
          .filter(Boolean)
      : [];
    observations.push({
      key: safeKeys[index],
      sampleValues,
      distinctCount: Math.max(sampleValues.length, count > 0 ? 1 : 0),
      presentOnSessionEvent: true,
      lastSeenAt: new Date().toISOString(),
      eventCount: count,
    });
  }

  // Sample raw property maps for unexpected but useful keys
  try {
    const sampleQuery = `select properties
from events
where timestamp >= now() - interval 14 day
  and event = ${quoteEvent(sessionEvent)}
order by timestamp desc
limit 80`;
    const samplePayload = await providerJSON(
      `${host}/api/projects/${encodeURIComponent(projectId)}/query/`,
      apiKey,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: { kind: "HogQLQuery", query: sampleQuery },
        }),
      },
    );
    const valueSets = new Map<string, Set<string>>();
    for (const sampleRow of Array.isArray(samplePayload.results)
      ? samplePayload.results
      : []) {
      if (!Array.isArray(sampleRow) || sampleRow.length < 1) continue;
      const props = sampleRow[0];
      if (!props || typeof props !== "object" || Array.isArray(props)) continue;
      for (const [key, value] of Object.entries(
        props as Record<string, unknown>,
      )) {
        if (!isSafePropertyKey(key)) continue;
        if (
          typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "boolean"
        ) {
          continue;
        }
        const asString = String(value).slice(0, 40);
        if (!asString) continue;
        const set = valueSets.get(key) ?? new Set<string>();
        if (set.size < 12) set.add(asString);
        valueSets.set(key, set);
      }
    }
    for (const [key, set] of valueSets) {
      if (observations.some((item) => item.key === key)) continue;
      observations.push({
        key,
        sampleValues: [...set],
        distinctCount: set.size,
        presentOnSessionEvent: true,
        lastSeenAt: new Date().toISOString(),
        eventCount: set.size,
      });
    }
  } catch {
    // optional enrichment
  }

  return {
    candidates: rankVersionPropertyCandidates(observations),
    sessionEvent,
    eventsSampled: totalEvents,
  };
}

export async function discoverVersionCandidatesForApp(
  env: Cloudflare.Env,
  workspaceId: string,
  appId: string,
): Promise<{
  candidates: VersionPropertyCandidate[];
  sessionEvent: string;
  activationEvent: string;
  mappingStatus: string;
  eventsSampled: number;
  suggestion: VersionPropertyCandidate | null;
}> {
  const connection = await env.DB.prepare(
    `SELECT id, credential_envelope FROM source_connections
     WHERE workspace_id=? AND app_id=? AND provider='posthog'
       AND status IN ('connected','needs-attention')
     LIMIT 1`,
  )
    .bind(workspaceId, appId)
    .first<{ id: string; credential_envelope: string }>();

  if (!connection) {
    return {
      candidates: [],
      sessionEvent: "",
      activationEvent: "",
      mappingStatus: "not_connected",
      eventsSampled: 0,
      suggestion: null,
    };
  }

  const mapping = await env.DB.prepare(
    `SELECT status,session_event,activation_event,version_property,
            version_property_status
     FROM posthog_mappings
     WHERE workspace_id=? AND connection_id=?
     LIMIT 1`,
  )
    .bind(workspaceId, connection.id)
    .first<{
      status: string;
      session_event: string;
      activation_event: string;
      version_property: string;
      version_property_status: string;
    }>();

  const envelope = JSON.parse(
    connection.credential_envelope,
  ) as CredentialEnvelope;
  const credentials = await openCredentials(
    envelope,
    requireSecret(env, "ENVELOPE_MASTER_KEY"),
  );

  let sessionEvent =
    (typeof credentials.sessionEvent === "string"
      ? credentials.sessionEvent
      : "") ||
    mapping?.session_event ||
    "";
  let activationEvent =
    (typeof credentials.activationEvent === "string"
      ? credentials.activationEvent
      : "") ||
    mapping?.activation_event ||
    "";

  if (!sessionEvent) {
    try {
      const events: PostHogEventOption[] = await discoverPostHogEvents(
        credentials,
        30,
      );
      // Prefer strongest session-like name without inventing activation mapping
      const preferred = events.find((event) =>
        /(\$pageview|\$screen|app_?open|session)/iu.test(event.name),
      );
      sessionEvent = preferred?.name ?? events[0]?.name ?? "";
    } catch {
      sessionEvent = "";
    }
  }

  if (!sessionEvent) {
    return {
      candidates: [],
      sessionEvent: "",
      activationEvent,
      mappingStatus: mapping?.status ?? "insufficient_events",
      eventsSampled: 0,
      suggestion: null,
    };
  }

  const discovered = await discoverVersionPropertyCandidates(
    credentials,
    sessionEvent,
  );

  // Persist candidates for Settings reload without re-querying immediately
  try {
    await env.DB.prepare(
      `UPDATE posthog_mappings SET
        version_candidates=?,
        updated_at=datetime('now')
       WHERE workspace_id=? AND connection_id=?`,
    )
      .bind(
        JSON.stringify(discovered.candidates.slice(0, 12)),
        workspaceId,
        connection.id,
      )
      .run();
  } catch {
    // non-fatal
  }

  return {
    candidates: discovered.candidates,
    sessionEvent,
    activationEvent,
    mappingStatus: mapping?.status ?? "automatic_unconfirmed",
    eventsSampled: discovered.eventsSampled,
    suggestion: discovered.candidates[0] ?? null,
  };
}
