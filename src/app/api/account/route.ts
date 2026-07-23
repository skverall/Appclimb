import {
  clearBackendSession,
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";

export async function DELETE() {
  const response = await requestWithSession("/v1/account", {
    method: "DELETE",
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (response.status === 204) {
    await clearBackendSession();
    return new Response(null, { status: 204 });
  }
  return relayBackendResponse(response);
}
