import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appId = url.searchParams.get("appId");
  const path = appId
    ? `/v1/agent-tokens?appId=${encodeURIComponent(appId)}`
    : "/v1/agent-tokens";
  const response = await requestWithSession(path);
  if (!response) {
    return Response.json({ error: "backend_unavailable" }, { status: 503 });
  }
  return relayBackendResponse(response);
}

export async function POST(request: Request) {
  const body = await request.text();
  const response = await requestWithSession("/v1/agent-tokens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!response) {
    return Response.json({ error: "backend_unavailable" }, { status: 503 });
  }
  return relayBackendResponse(response);
}
