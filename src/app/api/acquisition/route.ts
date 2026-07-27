import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";
import { demoAcquisitionSnapshotForWindow } from "@/lib/acquisition-demo";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = url.searchParams.get("days") ?? "7";
  if (!["7", "30", "90"].includes(days)) {
    return Response.json(
      { error: "invalid_analytics_window" },
      { status: 400 },
    );
  }
  const appId = (url.searchParams.get("appId") ?? url.searchParams.get("app") ?? "").trim();
  const backendQuery = new URLSearchParams({ days });
  if (appId) backendQuery.set("appId", appId);
  const response = await requestWithSession(
    `/v1/web-analytics?${backendQuery.toString()}`,
  );
  if (response) {
    return relayBackendResponse(response);
  }
  const windowDays = Number(days) as 7 | 30 | 90;
  const data = Object.fromEntries(
    Object.entries(demoAcquisitionSnapshotForWindow(windowDays)).filter(
      ([key]) => key !== "mode" && key !== "windowDays",
    ),
  );
  return Response.json({
    data,
    meta: {
      mode: "demo",
      windowDays,
      externalMutationsAllowed: false,
    },
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > 4_096) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }
  const response = await requestWithSession("/v1/web-analytics/property", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!response) {
    return Response.json(
      { error: "authentication_required" },
      { status: 401 },
    );
  }
  return relayBackendResponse(response);
}
