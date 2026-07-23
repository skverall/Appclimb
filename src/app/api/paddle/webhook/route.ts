import {
  backendRequest,
  relayBackendResponse,
} from "@/lib/backend";

export async function POST(request: Request) {
  const signature = request.headers.get("paddle-signature");
  const rawBody = await request.text();

  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 401 });
  }

  const response = await backendRequest("/v1/billing/webhook", {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      "paddle-signature": signature,
    },
    body: rawBody,
  });
  return relayBackendResponse(response);
}
