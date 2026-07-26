import { z } from "zod";

import { relayBackendResponse, requestWithSession } from "@/lib/backend";

const addKeywordSchema = z.object({
  appId: z.string().uuid(),
  keyword: z.string().trim().min(1).max(80),
  storefront: z.string().regex(/^[A-Z]{2}$/u),
});

export async function GET(request: Request) {
  const appId = new URL(request.url).searchParams.get("appId") ?? "";
  const response = await requestWithSession(
    `/v1/keywords?appId=${encodeURIComponent(appId)}`,
  );
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}

export async function POST(request: Request) {
  const parsed = addKeywordSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid keyword" }, { status: 400 });
  }
  const response = await requestWithSession("/v1/keywords", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
