import { relayBackendResponse, requestWithSession } from "@/lib/backend";

export async function GET(request: Request) {
  const appId = new URL(request.url).searchParams.get("appId") ?? "";
  const response = await requestWithSession(
    `/v1/keywords/suggestions?appId=${encodeURIComponent(appId)}`,
  );
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
