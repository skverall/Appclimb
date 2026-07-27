import { z } from "zod";

import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";
import {
  clearPostHogOAuthPending,
  listPostHogEvents,
  POSTHOG_CLIENT_ID,
  readPostHogOAuthPending,
} from "@/lib/posthog-oauth";
import { autoMapPostHogEvents } from "@/lib/posthog-events";

const inputSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  appId: z.string().trim().min(1).max(120).optional(),
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
  let events;
  try {
    events = await listPostHogEvents(pending, parsed.data.projectId);
  } catch {
    return Response.json(
      { error: "PostHog events could not be verified" },
      { status: 502 },
    );
  }
  const autoMap = autoMapPostHogEvents(events);
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
        targetAppId: parsed.data.appId || undefined,
        host: pending.host,
        activationEvent: autoMap.activationEvent,
        sessionEvent: autoMap.sessionEvent,
        eventFlow: autoMap.eventFlow,
        detectedEventCount: autoMap.detectedEventCount,
        mappingMode: "automatic",
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
