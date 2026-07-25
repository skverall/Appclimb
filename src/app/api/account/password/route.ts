import {
  clearBackendSession,
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";
import { z } from "zod";

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .refine((value) => value.currentPassword !== value.newPassword);

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid password change" }, { status: 400 });
  }
  const parsed = passwordChangeSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid password change" }, { status: 400 });
  }
  const response = await requestWithSession("/v1/account/password", {
    method: "POST",
    body: JSON.stringify(parsed.data),
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
