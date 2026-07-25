import { postHogOAuthClientMetadata } from "@/lib/posthog-oauth";

export const dynamic = "force-static";

export async function GET() {
  return Response.json(postHogOAuthClientMetadata(), {
    headers: {
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
