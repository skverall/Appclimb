import { z } from "zod";

import { relayBackendResponse, requestWithSession } from "@/lib/backend";

const observationSchema = z.object({
  keyword: z.string().min(1).max(80),
  storefront: z.string().regex(/^[A-Z]{2}$/u),
  rank: z.number().int().min(1).max(200).nullable(),
});

const observationsSchema = z.object({
  appId: z.string().uuid(),
  observations: z.array(observationSchema).max(50),
});

export async function POST(request: Request) {
  const parsed = observationsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid observations" }, { status: 400 });
  }
  const response = await requestWithSession("/v1/keywords/observations", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
