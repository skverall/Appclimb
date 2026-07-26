import { relayBackendResponse, requestWithSession } from "@/lib/backend";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ promptId: string }> },
) {
  const { promptId } = await context.params;
  const response = await requestWithSession(
    `/v1/ai-visibility/prompts/${encodeURIComponent(promptId)}`,
    { method: "DELETE" },
  );
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
