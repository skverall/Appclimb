import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { classifyCrawlerUserAgent } from "@/lib/crawler-classifier";

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const token = process.env.APPCLIMB_TRACKING_TOKEN;
  const userAgent = request.headers.get("user-agent") ?? "";
  if (
    token &&
    (request.method === "GET" || request.method === "HEAD") &&
    classifyCrawlerUserAgent(userAgent)
  ) {
    const collectorURL = new URL("/api/track/crawler", request.url);
    event.waitUntil(
      fetch(collectorURL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-appclimb-original-user-agent": userAgent,
        },
        body: JSON.stringify({
          token,
          eventId: crypto.randomUUID(),
          occurredAt: new Date().toISOString(),
          hostname: request.nextUrl.hostname,
          path: request.nextUrl.pathname,
        }),
      })
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
