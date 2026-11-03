import { NextRequest } from "next/server";

import { protectedResourceMetadata } from "@/lib/agent-auth";
import { agentJson, corsPreflight } from "@/lib/agent-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 9728 metadata for the MCP endpoint; MCP clients start discovery here. */
export function GET(request: NextRequest) {
  return agentJson(protectedResourceMetadata(request.nextUrl.origin), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return corsPreflight();
}
