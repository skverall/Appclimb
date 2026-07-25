import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";

export async function GET() {
  const response = await requestWithSession("/v1/sources");
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
