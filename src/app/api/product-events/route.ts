import { relayBackendResponse, requestWithSession } from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * AppClimb's own product analytics (plan section 14). Requires a session, so a
 * demo or anonymous visitor cannot write into a workspace's audit trail.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const response = await requestWithSession("/v1/product-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
