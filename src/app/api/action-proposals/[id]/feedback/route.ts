import { relayBackendResponse, requestWithSession } from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * Insight feedback (plan task P0.30): accept, dismiss, not relevant, mapping is
 * wrong, converted to experiment. The backend stores the reason and writes the
 * audit event that the accepted / dismissed / diagnosis-to-experiment rates are
 * computed from.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return Response.json({ error: "Invalid proposal id" }, { status: 400 });
  }
  const body = await request.text();
  const response = await requestWithSession(
    `/v1/action-proposals/${encodeURIComponent(id)}/feedback`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    },
  );
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
