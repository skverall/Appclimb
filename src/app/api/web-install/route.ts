import { relayBackendResponse, requestWithSession } from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * Server-derived website setup state (Task P0.27).
 *
 * The wizard, Pulse and the app tab all read this route so the "exact
 * incomplete step" survives a reload. It never synthesises state: when the
 * backend has no property, the response says so.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appId = (url.searchParams.get("appId") ?? "").trim();
  const query = appId ? `?appId=${encodeURIComponent(appId)}` : "";
  const response = await requestWithSession(
    `/v1/web-analytics/install${query}`,
  );
  if (!response) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 2_048) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }
  let input: { action?: string; step?: string; goal?: string; appId?: string };
  try {
    input = JSON.parse(raw || "{}") as typeof input;
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const path =
    input.action === "goal"
      ? "/v1/web-analytics/conversion-goal"
      : input.action === "step"
        ? "/v1/web-analytics/install/step"
        : "";
  if (!path) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const response = await requestWithSession(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      input.action === "goal"
        ? { goal: input.goal, appId: input.appId ?? "" }
        : { step: input.step, appId: input.appId ?? "" },
    ),
  });
  if (!response) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
