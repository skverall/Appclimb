import { backendRequest } from "@/lib/backend";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }
  const originalUserAgent =
    request.headers.get("x-appclimb-original-user-agent") ??
    request.headers.get("user-agent") ??
    "";
  const headers = new Headers({
    "content-type": "application/json",
    "x-appclimb-original-user-agent": originalUserAgent,
  });
  const country = request.headers.has("x-vercel-id")
    ? request.headers.get("x-vercel-ip-country")
    : request.headers.has("cf-ray")
      ? request.headers.get("cf-ipcountry")
      : null;
  if (country) headers.set("x-appclimb-country", country);

  try {
    const response = await backendRequest("/v1/web-analytics/crawler", {
      method: "POST",
      headers,
      body,
    });
    return new Response(
      response.status === 202 || response.status === 204
        ? null
        : await response.arrayBuffer(),
      {
        status: response.status,
        headers: {
          "cache-control": "no-store",
          "content-type":
            response.headers.get("content-type") ??
            "application/json; charset=utf-8",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "collector_unavailable" },
      { status: 503 },
    );
  }
}
