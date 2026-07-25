import { z } from "zod";

import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";
import {
  clearPostHogOAuthPending,
  POSTHOG_CLIENT_ID,
  readPostHogOAuthPending,
} from "@/lib/posthog-oauth";

const inputSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  activationEvent: z.string().trim().min(1).max(100),
  sessionEvent: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  const pending = await readPostHogOAuthPending();
  if (!pending) {
    return Response.json(
      { error: "PostHog authorization expired" },
      { status: 410 },
    );
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid connection request" }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid connection request" }, { status: 400 });
  }
  const response = await requestWithSession("/v1/sources/posthog", {
    method: "PUT",
    body: JSON.stringify({
      credentials: {
        personalApiKey: pending.accessToken,
        oauthRefreshToken: pending.refreshToken,
        oauthExpiresAt: pending.expiresAt,
        oauthClientId: POSTHOG_CLIENT_ID,
        authMethod: "oauth",
        projectId: parsed.data.projectId,
        host: pending.host,
        activationEvent: parsed.data.activationEvent,
        sessionEvent: parsed.data.sessionEvent,
      },
    }),
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (response.ok) await clearPostHogOAuthPending();
  return relayBackendResponse(response);
}

export async function DELETE() {
  await clearPostHogOAuthPending();
  return new Response(null, { status: 204 });
}
