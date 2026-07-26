import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";

export async function GET() {
  const response = await requestWithSession("/v1/sources/posthog/events");
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}

export async function PATCH(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid event selection" }, { status: 400 });
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return Response.json({ error: "Invalid event selection" }, { status: 400 });
  }
  const response = await requestWithSession("/v1/sources/posthog/events", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
