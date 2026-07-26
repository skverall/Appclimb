import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { classifyCrawlerUserAgent } from "@/lib/crawler-classifier";

interface BackendService {
  fetch(request: Request): Promise<Response>;
}

function crawlerCollector(
  request: NextRequest,
  token: string,
  userAgent: string,
) {
  const body = JSON.stringify({
    token,
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    hostname: request.nextUrl.hostname,
    path: request.nextUrl.pathname,
  });
  const headers = new Headers({
    "content-type": "application/json",
    "x-appclimb-original-user-agent": userAgent,
  });
  const country = request.headers.has("x-vercel-id")
    ? request.headers.get("x-vercel-ip-country")
    : request.headers.has("cf-ray")
      ? request.headers.get("cf-ipcountry")
      : null;
  if (country) headers.set("x-appclimb-country", country);

  try {
    const service = (
      getCloudflareContext().env as CloudflareEnv & {
        APPCLIMB_API?: BackendService;
      }
    ).APPCLIMB_API;
    if (service) {
      return service.fetch(
        new Request(
          "https://appclimb-api.internal/v1/web-analytics/crawler",
          { method: "POST", headers, body },
        ),
      );
    }
  } catch {
    // Local Next.js and an emergency non-Cloudflare rollback runtime do not
    // have a Cloudflare request context.
  }

  return fetch(new URL("/api/track/crawler", request.url), {
    method: "POST",
    headers,
    body,
  });
}

// Next.js 16 Proxy is Node-only, while OpenNext currently requires Edge
// Middleware. Keep this bounded crawler collector in the Edge runtime until
// OpenNext adds Node Proxy support.
export function middleware(request: NextRequest, event: NextFetchEvent) {
  const token = process.env.APPCLIMB_TRACKING_TOKEN;
  const userAgent = request.headers.get("user-agent") ?? "";
  if (
    token &&
    (request.method === "GET" || request.method === "HEAD") &&
    classifyCrawlerUserAgent(userAgent)
  ) {
    event.waitUntil(
      crawlerCollector(request, token, userAgent)
        .then(() => undefined)
        .catch(() => undefined),
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|appclimb-analytics.js).*)",
  ],
};
