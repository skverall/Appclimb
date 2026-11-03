import { NextRequest } from "next/server";

import { protectedResourceMetadata } from "@/lib/agent-auth";
import { agentJson, corsPreflight } from "@/lib/agent-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Path-suffixed variant (RFC 9728 §3.1) for the resource at /mcp. */
export function GET(request: NextRequest) {
  return agentJson(protectedResourceMetadata(request.nextUrl.origin), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return corsPreflight();
}
