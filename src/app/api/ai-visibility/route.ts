import { z } from "zod";

import { relayBackendResponse, requestWithSession } from "@/lib/backend";

const settingsSchema = z.object({
  appId: z.string().uuid(),
  cadence: z.enum(["manual", "weekly"]),
});

export async function GET(request: Request) {
  const appId = new URL(request.url).searchParams.get("appId") ?? "";
  const response = await requestWithSession(
    `/v1/ai-visibility?appId=${encodeURIComponent(appId)}`,
  );
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}

export async function PATCH(request: Request) {
  const parsed = settingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid scan cadence" }, { status: 400 });
  }
  const response = await requestWithSession("/v1/ai-visibility/settings", {
    method: "PATCH",
    body: JSON.stringify(parsed.data),
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
