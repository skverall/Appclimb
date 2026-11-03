import { NextRequest } from "next/server";

import { authorizationServerMetadata } from "@/lib/agent-auth";
import { agentJson, corsPreflight } from "@/lib/agent-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 8414 metadata for the AppClimb authorization server. */
export function GET(request: NextRequest) {
  return agentJson(authorizationServerMetadata(request.nextUrl.origin), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return corsPreflight();
}
