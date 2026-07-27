import { relayBackendResponse, requestWithSession } from "@/lib/backend";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return Response.json({ error: "Invalid app ID" }, { status: 400 });
  }
  const response = await requestWithSession(`/v1/apps/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
