import { relayBackendResponse, requestWithSession } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return Response.json({ error: "Invalid experiment id" }, { status: 400 });
  }
  const body = await request.text();
  const response = await requestWithSession(
    `/v1/experiments/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body,
    },
  );
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return Response.json({ error: "Invalid experiment id" }, { status: 400 });
  }
  const response = await requestWithSession(
    `/v1/experiments/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
