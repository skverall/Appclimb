import { z } from "zod";

import { relayBackendResponse, requestWithSession } from "@/lib/backend";

const addAppSchema = z.object({
  platform: z.literal("app-store"),
  appStoreId: z.string().regex(/^\d{1,20}$/u),
  storefront: z.string().regex(/^[A-Z]{2}$/u),
});

export async function GET() {
  const response = await requestWithSession("/v1/apps");
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}

export async function POST(request: Request) {
  const parsed = addAppSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid app selection" }, { status: 400 });
  }
  const response = await requestWithSession("/v1/apps", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
