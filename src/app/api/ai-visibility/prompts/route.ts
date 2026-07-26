import { z } from "zod";

import { relayBackendResponse, requestWithSession } from "@/lib/backend";

const promptSchema = z.object({
  appId: z.string().uuid(),
  category: z.enum(["discovery", "comparison", "branded"]),
  prompt: z.string().trim().min(8).max(500),
});

export async function POST(request: Request) {
  const parsed = promptSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid prompt" }, { status: 400 });
  }
  const response = await requestWithSession("/v1/ai-visibility/prompts", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
