import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.text();
  const response = await requestWithSession(
    `/v1/growth-ci/incidents/${encodeURIComponent(id)}/dismiss`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    },
  );
  if (!response) {
    return Response.json({ error: "backend_unavailable" }, { status: 503 });
  }
  return relayBackendResponse(response);
}
