import { appleToken, ProviderError } from "./connectors";

const maxProviderResponse = 2 * 1024 * 1024;
const eventNamePattern = /^[A-Za-z0-9_.$:/-]{1,100}$/u;

export interface Aggregate {
  metricKey: string;
  occurredAt: string;
  value: number;
  unit:
    | "count"
    | "currency"
    | "ratio"
    | "rank"
    | "range_count"
    | "range_ratio";
  dimensions: Record<string, string>;
  sourceUpdatedAt: string | null;
  completeness: number;
}

function required(
  credentials: Record<string, unknown>,
  key: string,
): string {
  const value = credentials[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderError("invalid_credentials_payload", 400);
  }
  return value.trim();
}

async function providerResponse(
  endpoint: string,
  token: string,
  init: RequestInit = {},
  accepted = new Set([200]),
): Promise<Response> {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new ProviderError("invalid_provider_host", 400);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  ) {
    throw new ProviderError("invalid_provider_host", 400);
  }
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("user-agent", "AppClimb/2.0 Cloudflare");
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
    response = await fetch(url, {
      ...init,
      redirect: "manual",
      headers,
    });
  } catch {
    throw new ProviderError("provider_unavailable", 502, true);
  }
  if (!accepted.has(response.status)) {
    await response.body?.cancel();
    throw new ProviderError(
      "provider_query_failed",
      response.status,
      response.status === 429 || response.status >= 500,
    );
  }
  return response;
}

async function providerJSON(
  endpoint: string,
  token: string,
  init: RequestInit = {},
  accepted = new Set([200]),
): Promise<Record<string, unknown>> {
  const response = await providerResponse(endpoint, token, init, accepted);
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > maxProviderResponse) {
    await response.body?.cancel();
    throw new ProviderError("provider_response_too_large", 502, true);
  }
  const text = await response.text();
  if (text.length > maxProviderResponse) {
    throw new ProviderError("provider_response_too_large", 502, true);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ProviderError("invalid_provider_response", 502, true);
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numeric(value: unknown): number | null {
  const result =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(result) ? result : null;
}

function dateValue(value: unknown): Date | null {
  if (typeof value === "number") {
    return new Date(value > 1_000_000_000_000 ? value : value * 1000);
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const numericDate = numeric(value);
  if (numericDate !== null && /^\d+(?:\.\d+)?$/u.test(value)) {
    return new Date(
      numericDate > 1_000_000_000_000 ? numericDate : numericDate * 1000,
    );
  }
  const normalized = /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? `${value}T00:00:00.000Z`
    : value.endsWith("Z") || /[+-]\d\d:\d\d$/u.test(value)
      ? value
      : `${value.replace(" ", "T")}Z`;
  const result = new Date(normalized);
  return Number.isFinite(result.getTime()) ? result : null;
}

function completeness(to: Date, occurredAt: Date, lagDays = 0): number {
  const completeBefore = new Date(to);
  completeBefore.setUTCDate(completeBefore.getUTCDate() - lagDays);
  return occurredAt < completeBefore ? 1 : 0.7;
}

async function readRevenueCat(
  credentials: Record<string, unknown>,
  from: Date,
  to: Date,
): Promise<Aggregate[]> {
  const apiKey = required(credentials, "apiKey");
  const projectId = required(credentials, "projectId");
  const charts = [
    ["revenue", "revenue", "currency"],
    ["trials_new", "trials_new", "count"],
    ["actives_new", "paid_new", "count"],
    ["trial_conversion_rate", "trial_to_paid", "ratio"],
    ["subscription_retention", "renewal_rate", "ratio"],
    ["churn", "churn_rate", "ratio"],
  ] as const;
  const result: Aggregate[] = [];
  for (const [chart, metricKey, unit] of charts) {
    const query = new URLSearchParams({
      realtime: "false",
      resolution: "0",
      start_date: from.toISOString().slice(0, 10),
      end_date: new Date(to.getTime() - 1).toISOString().slice(0, 10),
    });
    let payload: Record<string, unknown>;
    try {
      payload = await providerJSON(
        `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}/charts/${encodeURIComponent(chart)}?${query}`,
        apiKey,
      );
    } catch (error) {
      if (
        error instanceof ProviderError &&
        [400, 404].includes(error.status)
      ) {
        continue;
      }
      throw error;
    }
    const updated = dateValue(payload.last_computed_at);
    const values = Array.isArray(payload.values) ? payload.values : [];
    for (const item of values) {
      if (!Array.isArray(item) || item.length < 2) continue;
      const occurredAt = dateValue(item[0]);
      const value = [...item]
        .reverse()
        .map(numeric)
        .find((candidate) => candidate !== null);
      if (
        !occurredAt ||
        value === undefined ||
        value === null ||
        occurredAt < from ||
        occurredAt >= to
      ) {
        continue;
      }
      result.push({
        metricKey,
        occurredAt: occurredAt.toISOString(),
        value: unit === "ratio" && value > 1 ? value / 100 : value,
        unit,
        dimensions: { chart },
        sourceUpdatedAt: updated?.toISOString() ?? null,
        completeness: completeness(to, occurredAt),
      });
    }
  }
  return result;
}

async function readPostHog(
  credentials: Record<string, unknown>,
  from: Date,
  to: Date,
): Promise<Aggregate[]> {
  const apiKey = required(credentials, "personalApiKey");
  const projectId = required(credentials, "projectId");
  const host = required(credentials, "host").replace(/\/+$/u, "");
  if (!["https://us.posthog.com", "https://eu.posthog.com"].includes(host)) {
    throw new ProviderError("invalid_posthog_host", 400);
  }
  const entries = [
    [
      typeof credentials.activationEvent === "string" &&
      credentials.activationEvent.trim()
        ? credentials.activationEvent.trim()
        : "app_activated",
      "activated_users",
    ],
    [
      typeof credentials.sessionEvent === "string" &&
      credentials.sessionEvent.trim()
        ? credentials.sessionEvent.trim()
        : "$session_start",
      "active_users",
    ],
  ] as const;
  if (entries.some(([event]) => !eventNamePattern.test(event))) {
    throw new ProviderError("invalid_posthog_event_name", 400);
  }
  const metricByEvent = new Map(entries);
  const quoted = entries
    .map(([event]) => `'${event.replaceAll("'", "''")}'`)
    .join(",");
  const query = `select
  toStartOfDay(timestamp) as day,
  event,
  count(distinct person_id) as total
from events
where timestamp >= toDateTime('${from.toISOString().slice(0, 19).replace("T", " ")}','UTC')
  and timestamp < toDateTime('${to.toISOString().slice(0, 19).replace("T", " ")}','UTC')
  and event in (${quoted})
group by day,event
order by day,event`;
  const payload = await providerJSON(
    `${host}/api/projects/${encodeURIComponent(projectId)}/query/`,
    apiKey,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    },
  );
  const result: Aggregate[] = [];
  const now = new Date().toISOString();
  for (const row of Array.isArray(payload.results) ? payload.results : []) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const occurredAt = dateValue(row[0]);
    const event = typeof row[1] === "string" ? row[1] : "";
    const value = numeric(row[2]);
    const metricKey = metricByEvent.get(event);
    if (!occurredAt || value === null || !metricKey) continue;
    result.push({
      metricKey,
      occurredAt: occurredAt.toISOString(),
      value,
      unit: "count",
      dimensions: { event },
      sourceUpdatedAt: now,
      completeness: completeness(to, occurredAt),
    });
  }
  return result;
}

async function readSuperwall(
  credentials: Record<string, unknown>,
  from: Date,
  to: Date,
): Promise<Aggregate[]> {
  const apiKey = required(credentials, "apiKey");
  const projectId = required(credentials, "projectId");
  const applicationId =
    typeof credentials.applicationId === "string"
      ? credentials.applicationId.trim()
      : "";
  if (!applicationId) return [];
  const snapshotFrom = new Date(
    Math.max(from.getTime(), to.getTime() - 30 * 24 * 60 * 60 * 1000),
  );
  const query = new URLSearchParams({
    environment: "PRODUCTION",
    from: snapshotFrom.toISOString(),
    to: to.toISOString(),
  });
  const payload = await providerJSON(
    `https://api.superwall.com/v2/projects/${encodeURIComponent(projectId)}/applications/${encodeURIComponent(applicationId)}/statistics?${query}`,
    apiKey,
  );
  const result: Aggregate[] = [];
  for (const raw of Array.isArray(payload.statistics)
    ? payload.statistics
    : []) {
    const statistic = objectValue(raw);
    const text =
      `${String(statistic.key ?? "")} ${String(statistic.name ?? "")}`.toLowerCase();
    let metricKey = "";
    let unit: Aggregate["unit"] = "range_count";
    if (text.includes("paywall") && text.includes("view")) {
      metricKey = "paywall_views";
    } else if (text.includes("paywall") && text.includes("conversion")) {
      metricKey = "paywall_conversion";
      unit = "range_ratio";
    } else if (text.includes("trial")) {
      metricKey = "superwall_trials";
    }
    const value = numeric(objectValue(statistic.value).value);
    if (!metricKey || value === null) continue;
    result.push({
      metricKey,
      occurredAt: new Date(to.getTime() - 1).toISOString(),
      value: unit === "range_ratio" && value > 1 ? value / 100 : value,
      unit,
      dimensions: {
        aggregation: "range_snapshot",
        statistic: String(statistic.key ?? ""),
        window_from: snapshotFrom.toISOString(),
        window_to: to.toISOString(),
      },
      sourceUpdatedAt: new Date().toISOString(),
      completeness: 1,
    });
  }
  return result;
}

function aggregateKey(item: Aggregate): string {
  return [
    item.metricKey,
    item.occurredAt,
    item.unit,
    item.dimensions.category ?? "",
  ].join("\u0000");
}

function mergeApple(
  rows: Aggregate[],
  mode: "sum" | "maximum",
): Aggregate[] {
  const merged = new Map<string, Aggregate>();
  for (const row of rows) {
    const key = aggregateKey(row);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...row, dimensions: { category: "APP_STORE" } });
      continue;
    }
    const useRow =
      mode === "sum"
        ? false
        : row.value > current.value ||
          (row.value === current.value &&
            String(row.sourceUpdatedAt) > String(current.sourceUpdatedAt));
    const selected = useRow ? row : current;
    merged.set(key, {
      ...selected,
      value: mode === "sum" ? current.value + row.value : selected.value,
      sourceUpdatedAt:
        String(row.sourceUpdatedAt) > String(current.sourceUpdatedAt)
          ? row.sourceUpdatedAt
          : current.sourceUpdatedAt,
      completeness: Math.min(current.completeness, row.completeness),
      dimensions: { category: "APP_STORE" },
    });
  }
  return [...merged.values()].sort(
    (left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) ||
      left.metricKey.localeCompare(right.metricKey),
  );
}

export function parseAppleTSV(
  text: string,
  from: Date,
  to: Date,
  sourceUpdatedAt: Date,
): Aggregate[] {
  const lines = text.split(/\n/u);
  const headers = (lines.shift() ?? "").replace(/\r$/u, "").split("\t");
  const dateIndex = headers.findIndex((header) =>
    ["Date", "date"].includes(header.trim()),
  );
  if (dateIndex < 0) {
    throw new ProviderError("invalid_apple_report", 502, true);
  }
  const metricColumns = new Map<number, string>();
  const mapping: Record<string, string> = {
    impressionsTotal: "impressions",
    pageViewCount: "product_page_views",
    units: "downloads",
    totalDownloads: "downloads",
  };
  headers.forEach((header, index) => {
    const metric = mapping[header.trim()];
    if (metric) metricColumns.set(index, metric);
  });
  const result: Aggregate[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = line.replace(/\r$/u, "").split("\t");
    const occurredAt = dateValue(fields[dateIndex]);
    if (!occurredAt || occurredAt < from || occurredAt >= to) continue;
    for (const [index, metricKey] of metricColumns) {
      const value = numeric(fields[index]);
      if (value === null) continue;
      result.push({
        metricKey,
        occurredAt: occurredAt.toISOString(),
        value,
        unit: "count",
        dimensions: { category: "APP_STORE" },
        sourceUpdatedAt: sourceUpdatedAt.toISOString(),
        completeness: completeness(to, occurredAt, 2),
      });
    }
  }
  return mergeApple(result, "sum");
}

async function readApple(
  credentials: Record<string, unknown>,
  from: Date,
  to: Date,
): Promise<Aggregate[]> {
  const issuerId = required(credentials, "issuerId");
  const keyId = required(credentials, "keyId");
  const privateKey = required(credentials, "privateKey");
  const appId = required(credentials, "appId");
  const token = await appleToken(issuerId, keyId, privateKey);
  const base = "https://api.appstoreconnect.apple.com";
  const requestPayload = {
    data: {
      type: "analyticsReportRequests",
      attributes: { accessType: "ONGOING" },
      relationships: { app: { data: { type: "apps", id: appId } } },
    },
  };
  await providerResponse(
    `${base}/v1/analyticsReportRequests`,
    token,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestPayload),
    },
    new Set([200, 201, 202, 204, 409]),
  ).then((response) => response.body?.cancel());
  const requestQuery = new URLSearchParams({
    "filter[accessType]": "ONGOING",
    "filter[app]": appId,
  });
  const requests = await providerJSON(
    `${base}/v1/analyticsReportRequests?${requestQuery}`,
    token,
  );
  const request = (Array.isArray(requests.data) ? requests.data : [])
    .map(objectValue)
    .find(
      (item) =>
        String(objectValue(item.attributes).accessType).toUpperCase() ===
        "ONGOING",
    );
  const requestId = String(request?.id ?? "");
  if (!requestId) return [];
  let reportsUrl = `${base}/v1/analyticsReportRequests/${encodeURIComponent(requestId)}/reports?filter[category]=APP_STORE&limit=100`;
  const reportIds = new Set<string>();
  while (reportsUrl) {
    const payload = await providerJSON(reportsUrl, token);
    for (const raw of Array.isArray(payload.data) ? payload.data : []) {
      const item = objectValue(raw);
      if (
        String(objectValue(item.attributes).category).toUpperCase() ===
        "APP_STORE" &&
        item.id
      ) {
        reportIds.add(String(item.id));
      }
    }
    reportsUrl = String(objectValue(payload.links).next ?? "");
  }
  const reportResults: Aggregate[] = [];
  for (const reportId of [...reportIds].sort()) {
    let instancesUrl = `${base}/v1/analyticsReports/${encodeURIComponent(reportId)}/instances?filter[frequency]=DAILY&limit=100`;
    const segmentUrls: string[] = [];
    while (instancesUrl) {
      const payload = await providerJSON(instancesUrl, token);
      for (const raw of Array.isArray(payload.data) ? payload.data : []) {
        const item = objectValue(raw);
        const attributes = objectValue(item.attributes);
        const day = dateValue(attributes.reportingDate);
        if (
          !day ||
          day < from ||
          day >= to ||
          String(attributes.frequency).toUpperCase() !== "DAILY"
        ) {
          continue;
        }
        const segmentPayload = await providerJSON(
          `${base}/v1/analyticsReportInstances/${encodeURIComponent(String(item.id))}/segments?fields[analyticsReportSegments]=url,checksum,sizeInBytes`,
          token,
        );
        for (const segmentRaw of Array.isArray(segmentPayload.data)
          ? segmentPayload.data
          : []) {
          const url = String(
            objectValue(objectValue(segmentRaw).attributes).url ?? "",
          );
          if (url) segmentUrls.push(url);
        }
      }
      instancesUrl = String(objectValue(payload.links).next ?? "");
    }
    const rows: Aggregate[] = [];
    for (const segmentUrl of segmentUrls.sort()) {
      const response = await providerResponse(segmentUrl, token);
      if (!response.body) continue;
      const decompressed = response.body.pipeThrough(
        new DecompressionStream("gzip"),
      );
      const text = await new Response(decompressed).text();
      if (text.length > 16 * 1024 * 1024) {
        throw new ProviderError("provider_response_too_large", 502, true);
      }
      rows.push(...parseAppleTSV(text, from, to, new Date()));
    }
    reportResults.push(...mergeApple(rows, "sum"));
  }
  return mergeApple(reportResults, "maximum");
}

export async function refreshPostHogOAuth(
  credentials: Record<string, unknown>,
): Promise<{ credentials: Record<string, unknown>; changed: boolean }> {
  if (String(credentials.authMethod ?? "").trim() !== "oauth") {
    return { credentials, changed: false };
  }
  const expiresAt = dateValue(credentials.oauthExpiresAt);
  if (!expiresAt) {
    throw new ProviderError("invalid_posthog_oauth_credentials", 400);
  }
  if (Date.now() + 2 * 60 * 1000 < expiresAt.getTime()) {
    return { credentials, changed: false };
  }
  const refreshToken = required(credentials, "oauthRefreshToken");
  const clientId = required(credentials, "oauthClientId");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const payload = await providerJSON(
    "https://oauth.posthog.com/oauth/token/",
    "",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!accessToken) {
    throw new ProviderError("invalid_provider_response", 502, true);
  }
  const expiresIn = Math.max(60, numeric(payload.expires_in) ?? 3600);
  return {
    changed: true,
    credentials: {
      ...credentials,
      personalApiKey: accessToken,
      oauthRefreshToken:
        typeof payload.refresh_token === "string" &&
        payload.refresh_token.trim()
          ? payload.refresh_token.trim()
          : refreshToken,
      oauthExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    },
  };
}

export async function readAggregates(
  provider: string,
  credentials: Record<string, unknown>,
  from: Date,
  to: Date,
): Promise<Aggregate[]> {
  if (!(from < to)) throw new ProviderError("invalid_sync_window", 400);
  switch (provider) {
    case "app-store-connect":
      return readApple(credentials, from, to);
    case "revenuecat":
      return readRevenueCat(credentials, from, to);
    case "posthog":
      return readPostHog(credentials, from, to);
    case "superwall":
      return readSuperwall(credentials, from, to);
    default:
      throw new ProviderError("unsupported_provider", 400);
  }
}
