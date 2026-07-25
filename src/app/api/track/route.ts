import { backendRequest } from "@/lib/backend";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
  };
}

function countryFromRequest(request: Request) {
  if (request.headers.has("x-vercel-id")) {
    return request.headers.get("x-vercel-ip-country") ?? "";
  }
  if (request.headers.has("cf-ray")) {
    return request.headers.get("cf-ipcountry") ?? "";
  }
  return "";
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return Response.json(
      { error: "payload_too_large" },
      { status: 413, headers: corsHeaders() },
    );
  }
  const headers = new Headers({
    "content-type": "application/json",
    "user-agent": request.headers.get("user-agent") ?? "Unknown",
  });
  const country = countryFromRequest(request);
  if (country) headers.set("x-appclimb-country", country);

  let response: Response;
  try {
    response = await backendRequest("/v1/web-analytics/collect", {
      method: "POST",
      headers,
      body,
    });
  } catch {
    return Response.json(
      { error: "collector_unavailable" },
      { status: 503, headers: corsHeaders() },
    );
  }
  return new Response(
    response.status === 202 || response.status === 204
      ? null
      : await response.arrayBuffer(),
    {
      status: response.status,
      headers: {
        ...corsHeaders(),
        "content-type":
          response.headers.get("content-type") ??
          "application/json; charset=utf-8",
      },
    },
  );
}
