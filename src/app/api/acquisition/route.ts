import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";
import { demoAcquisitionSnapshot } from "@/lib/acquisition-demo";

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
  const response = await requestWithSession(
    `/v1/web-analytics?days=${days}`,
  );
  if (response) {
    return relayBackendResponse(response);
  }
  const data = Object.fromEntries(
    Object.entries(demoAcquisitionSnapshot).filter(
      ([key]) => key !== "mode" && key !== "windowDays",
    ),
  );
  return Response.json({
    data,
    meta: {
      mode: "demo",
      windowDays: Number(days),
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
