import { z } from "zod";

import { relayBackendResponse, requestWithSession } from "@/lib/backend";

const appStoreMetadataSchema = z.object({
  appStoreId: z.string().regex(/^\d{1,20}$/u),
  name: z.string().min(1).max(120),
  bundleId: z.string().max(255).optional(),
  developer: z.string().max(160).optional(),
  genre: z.string().max(80).optional(),
  iconUrl: z.string().max(1024).optional(),
  storeUrl: z.string().max(1024).optional(),
});

const webMetadataSchema = z.object({
  domain: z.string().min(1).max(255),
  name: z.string().min(1).max(120),
  iconUrl: z.string().max(1024).optional(),
});

const addAppSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("app-store"),
    storefront: z.string().regex(/^[A-Z]{2}$/u),
    metadata: appStoreMetadataSchema,
  }),
  z.object({
    platform: z.literal("web"),
    metadata: webMetadataSchema,
  }),
]);

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

const updateAppSchema = z.object({
  name: z.string().min(1).max(120),
  storefront: z.string().regex(/^[A-Z]{2}$/u).optional(),
});

export async function PATCH(request: Request) {
  const parsed = updateAppSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid app name or storefront" }, { status: 400 });
  }
  const response = await requestWithSession("/v1/apps", {
    method: "PATCH",
    body: JSON.stringify(parsed.data),
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}

