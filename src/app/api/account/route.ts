import {
  clearBackendSession,
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";
import { z } from "zod";

const profileSchema = z.object({
  avatarKey: z.enum([
    "ridge",
    "river",
    "summit",
    "forest",
    "dawn",
    "glacier",
    "night",
    "horizon",
  ]),
});

export async function PATCH(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid profile update" }, { status: 400 });
  }
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid profile update" }, { status: 400 });
  }
  const response = await requestWithSession("/v1/me", {
    method: "PATCH",
    body: JSON.stringify(parsed.data),
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}

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
