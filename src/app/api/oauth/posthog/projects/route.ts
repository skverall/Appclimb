import { requestWithSession } from "@/lib/backend";
import {
  listPostHogProjects,
  readPostHogOAuthPending,
} from "@/lib/posthog-oauth";

export async function GET() {
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
  try {
    return Response.json({
      data: {
        projects: await listPostHogProjects(pending),
        host: pending.host,
      },
    });
  } catch {
    return Response.json(
      { error: "PostHog projects could not be loaded" },
      { status: 502 },
    );
  }
}
