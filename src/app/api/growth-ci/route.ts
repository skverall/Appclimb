import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appId = url.searchParams.get("appId") ?? "";
  if (!appId) {
    return Response.json({ error: "app_id_required" }, { status: 400 });
  }
  const response = await requestWithSession(
    `/v1/growth-ci?appId=${encodeURIComponent(appId)}`,
  );
  if (!response) {
    return Response.json({ error: "backend_unavailable" }, { status: 503 });
  }
  return relayBackendResponse(response);
}
