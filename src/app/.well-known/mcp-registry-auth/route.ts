export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proof that appclimb.app owns the `app.appclimb/*` namespace in the official
 * MCP Registry (HTTP domain verification). Only the public half of the
 * Ed25519 key is here; the private key stays off the repository
 * (see docs/mcp-directory-submissions.md).
 */
const MCP_REGISTRY_PROOF = "v=MCPv1; k=ed25519; p=vJLiWHA/qpNlV9+NqytPiy8MIRnW5/XbgabEcQHXn3A=";

export function GET() {
  return new Response(`${MCP_REGISTRY_PROOF}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
