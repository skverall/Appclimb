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
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
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
  reportName = "",
  lagDays = 2,
): Aggregate[] {
  const lines = text.split(/\n/u);
  const headers = (lines.shift() ?? "").replace(/\r$/u, "").split("\t");
  const headerIndex = new Map(
    headers.map((header, index) => [header.trim(), index]),
  );
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
  const eventIndex = headerIndex.get("Event");
  const pageTypeIndex = headerIndex.get("Page Type");
  const downloadTypeIndex = headerIndex.get("Download Type");
  const countsIndex = headerIndex.get("Counts");
  const isEngagement =
    reportName === "App Store Discovery and Engagement Standard";
  const isDownloads = reportName === "App Downloads Standard";
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = line.replace(/\r$/u, "").split("\t");
    const occurredAt = dateValue(fields[dateIndex]);
    if (!occurredAt || occurredAt < from || occurredAt >= to) continue;
    if (countsIndex !== undefined) {
      const value = numeric(fields[countsIndex]);
      let metricKey = "";
      if (isEngagement && eventIndex !== undefined) {
        const event = String(fields[eventIndex] ?? "").trim().toLowerCase();
        const pageType =
          pageTypeIndex === undefined
            ? ""
            : String(fields[pageTypeIndex] ?? "").trim().toLowerCase();
        if (event === "impression") {
          metricKey = "impressions";
        } else if (event === "page view" && pageType === "product page") {
          metricKey = "product_page_views";
        }
      } else if (isDownloads && downloadTypeIndex !== undefined) {
        const downloadType = String(fields[downloadTypeIndex] ?? "")
          .trim()
          .toLowerCase();
        if (
          downloadType === "first-time download" ||
          downloadType === "redownload"
        ) {
          metricKey = "downloads";
        }
      }
      if (metricKey && value !== null) {
        result.push({
          metricKey,
          occurredAt: occurredAt.toISOString(),
          value,
          unit: "count",
          dimensions: { category: "APP_STORE" },
          sourceUpdatedAt: sourceUpdatedAt.toISOString(),
          completeness: completeness(to, occurredAt, lagDays),
        });
      }
    }
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
        completeness: completeness(to, occurredAt, lagDays),
      });
    }
  }
  return mergeApple(result, "sum");
}

async function appleReportJSON(
  endpoint: string,
  token: string,
): Promise<Record<string, unknown>> {
  try {
    return await providerJSON(endpoint, token);
  } catch (error) {
    if (error instanceof ProviderError && error.status === 403) {
      throw new ProviderError("apple_reports_role_required", 403);
    }
    throw error;
  }
}

async function downloadAppleTSV(endpoint: string): Promise<string> {
  const response = await providerResponse(endpoint, "", {
    headers: {
      accept: "application/a-gzip, application/gzip, application/octet-stream",
    },
  });
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > 16 * 1024 * 1024) {
    await response.body?.cancel();
    throw new ProviderError("provider_response_too_large", 502, true);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 16 * 1024 * 1024) {
    throw new ProviderError("provider_response_too_large", 502, true);
  }
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = isGzip
    ? await new Response(
        new Response(bytes).body?.pipeThrough(new DecompressionStream("gzip")),
      ).text()
    : new TextDecoder().decode(bytes);
  if (text.length > 16 * 1024 * 1024) {
    throw new ProviderError("provider_response_too_large", 502, true);
  }
  return text;
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
  const requests = await appleReportJSON(
    `${base}/v1/apps/${encodeURIComponent(appId)}/analyticsReportRequests?limit=200`,
    token,
  );
  const request = (Array.isArray(requests.data) ? requests.data : [])
    .map(objectValue)
    .filter(
      (item) =>
        item.id &&
        objectValue(item.attributes).stoppedDueToInactivity !== true,
    )
    .sort((left, right) => {
      const priority = (item: Record<string, unknown>) =>
        String(objectValue(item.attributes).accessType).toUpperCase() ===
        "ONGOING"
          ? 0
          : 1;
      return priority(left) - priority(right);
    })[0];
  const requestId = String(request?.id ?? "");
  if (!requestId) {
    throw new ProviderError("apple_report_request_required", 409);
  }
  const requestType = String(
    objectValue(request.attributes).accessType ?? "",
  ).toUpperCase();
  const ongoingCutoff = new Date(
    from.getTime() - 7 * 24 * 60 * 60 * 1000,
  );
  let reportsUrl = `${base}/v1/analyticsReportRequests/${encodeURIComponent(requestId)}/reports?limit=200`;
  const reports = new Map<
    string,
    { id: string; name: string; lagDays: number }
  >();
  const wantedReports = new Map([
    [
      "App Store Discovery and Engagement Standard",
      { metric: "engagement", lagDays: 3 },
    ],
    ["App Downloads Standard", { metric: "downloads", lagDays: 2 }],
  ]);
  while (reportsUrl) {
    const payload = await appleReportJSON(reportsUrl, token);
    for (const raw of Array.isArray(payload.data) ? payload.data : []) {
      const item = objectValue(raw);
      const name = String(objectValue(item.attributes).name ?? "");
      const wanted = wantedReports.get(name);
      if (wanted && item.id) {
        reports.set(wanted.metric, {
          id: String(item.id),
          name,
          lagDays: wanted.lagDays,
        });
      }
    }
    reportsUrl = String(objectValue(payload.links).next ?? "");
  }
  if (!reports.size) {
    throw new ProviderError("apple_reports_pending", 202);
  }
  const reportResults: Aggregate[] = [];
  let instanceCount = 0;
  for (const report of [...reports.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    let instancesUrl = `${base}/v1/analyticsReports/${encodeURIComponent(report.id)}/instances?filter[granularity]=DAILY&limit=200`;
    const instances: Array<{
      id: string;
      processingDate: Date;
    }> = [];
    while (instancesUrl) {
      const payload = await appleReportJSON(instancesUrl, token);
      for (const raw of Array.isArray(payload.data) ? payload.data : []) {
        const item = objectValue(raw);
        const attributes = objectValue(item.attributes);
        const processingDate = dateValue(attributes.processingDate);
        if (
          !item.id ||
          !processingDate ||
          String(attributes.granularity).toUpperCase() !== "DAILY" ||
          (requestType === "ONGOING" && processingDate < ongoingCutoff)
        ) {
          continue;
        }
        instances.push({ id: String(item.id), processingDate });
      }
      instancesUrl = String(objectValue(payload.links).next ?? "");
    }
    instanceCount += instances.length;
    const latestRowsByDay = new Map<
      string,
      { processingDate: string; rows: Aggregate[] }
    >();
    for (const instance of instances.sort(
      (left, right) =>
        left.processingDate.getTime() - right.processingDate.getTime(),
    )) {
      let segmentsUrl = `${base}/v1/analyticsReportInstances/${encodeURIComponent(instance.id)}/segments?fields[analyticsReportSegments]=url,checksum,sizeInBytes&limit=200`;
      const segmentUrls: string[] = [];
      while (segmentsUrl) {
        const segmentPayload = await appleReportJSON(segmentsUrl, token);
        for (const segmentRaw of Array.isArray(segmentPayload.data)
          ? segmentPayload.data
          : []) {
          const url = String(
            objectValue(objectValue(segmentRaw).attributes).url ?? "",
          );
          if (url) segmentUrls.push(url);
        }
        segmentsUrl = String(objectValue(segmentPayload.links).next ?? "");
      }
      const instanceRows: Aggregate[] = [];
      for (const segmentUrl of segmentUrls.sort()) {
        const text = await downloadAppleTSV(segmentUrl);
        instanceRows.push(
          ...parseAppleTSV(
            text,
            from,
            to,
            instance.processingDate,
            report.name,
            report.lagDays,
          ),
        );
      }
      const rowsByDay = new Map<string, Aggregate[]>();
      for (const row of mergeApple(instanceRows, "sum")) {
        const rows = rowsByDay.get(row.occurredAt) ?? [];
        rows.push(row);
        rowsByDay.set(row.occurredAt, rows);
      }
      for (const [day, rows] of rowsByDay) {
        latestRowsByDay.set(day, {
          processingDate: instance.processingDate.toISOString(),
          rows,
        });
      }
    }
    reportResults.push(
      ...[...latestRowsByDay.values()].flatMap((entry) => entry.rows),
    );
  }
  if (!instanceCount) {
    throw new ProviderError("apple_reports_pending", 202);
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
