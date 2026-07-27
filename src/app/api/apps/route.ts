import { z } from "zod";

import { relayBackendResponse, requestWithSession } from "@/lib/backend";

const metadataSchema = z.object({
  appStoreId: z.string().regex(/^\d{1,20}$/u),
  name: z.string().min(1).max(120),
  bundleId: z.string().max(255).optional(),
  developer: z.string().max(160).optional(),
  genre: z.string().max(80).optional(),
  iconUrl: z.string().max(1024).optional(),
  storeUrl: z.string().max(1024).optional(),
});

const addAppSchema = z.object({
  platform: z.literal("app-store"),
  storefront: z.string().regex(/^[A-Z]{2}$/u),
  metadata: metadataSchema,
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
