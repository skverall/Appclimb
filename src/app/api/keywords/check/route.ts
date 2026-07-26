import { z } from "zod";

import { relayBackendResponse, requestWithSession } from "@/lib/backend";

const checkSchema = z.object({ appId: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = checkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid app" }, { status: 400 });
  }
  const response = await requestWithSession("/v1/keywords/check", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
