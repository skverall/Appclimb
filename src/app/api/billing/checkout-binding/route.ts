import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid checkout request" }, { status: 400 });
  }

  const priceId =
    payload &&
    typeof payload === "object" &&
    "priceId" in payload &&
    typeof payload.priceId === "string"
      ? payload.priceId.trim()
      : "";
  if (!priceId || priceId.length > 120) {
    return Response.json({ error: "Invalid checkout request" }, { status: 400 });
  }

  const response = await requestWithSession(
    "/v1/billing/checkout-binding",
    {
      method: "POST",
      body: JSON.stringify({ priceId }),
    },
  );
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
