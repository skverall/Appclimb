import { requestWithSession } from "@/lib/backend";
import {
  listPostHogEvents,
  readPostHogOAuthPending,
} from "@/lib/posthog-oauth";

export async function GET(request: Request) {
  const identity = await requestWithSession("/v1/me");
  if (!identity?.ok) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const pending = await readPostHogOAuthPending();
  if (!pending) {
    return Response.json(
      { error: "PostHog authorization expired" },
      { status: 410 },
    );
  }
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
  if (!/^\d{1,20}$/u.test(projectId)) {
    return Response.json({ error: "Choose a PostHog project" }, { status: 400 });
  }
  try {
    return Response.json({
      data: {
        events: await listPostHogEvents(pending, projectId),
        windowDays: 30,
      },
    });
  } catch {
    return Response.json(
      { error: "PostHog events could not be loaded" },
      { status: 502 },
    );
  }
}
