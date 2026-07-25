import {
  POSTHOG_CLIENT_ID,
  POSTHOG_OAUTH_SCOPES,
  POSTHOG_REDIRECT_URI,
} from "@/lib/posthog-oauth";

export const dynamic = "force-static";

export async function GET() {
  return Response.json(
    {
      client_id: POSTHOG_CLIENT_ID,
      client_name: "AppClimb",
      client_uri: "https://appclimb.app",
      logo_uri: "https://appclimb.app/icon.svg",
      redirect_uris: [POSTHOG_REDIRECT_URI],
      token_endpoint_auth_method: "none",
      scope: POSTHOG_OAUTH_SCOPES,
      "com.posthog.scopes": POSTHOG_OAUTH_SCOPES.split(" "),
    },
    {
      headers: {
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
