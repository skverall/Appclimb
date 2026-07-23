import {
  checkedJson,
  type ConnectorClient,
  type ConnectorVerification,
} from "@/lib/connectors/types";

export interface PostHogCredentials {
  personalApiKey: string;
  projectId: string;
  host: string;
}

function normalizeHost(host: string): string {
  const url = new URL(host);
  if (url.protocol !== "https:") {
    throw new Error("PostHog host must use HTTPS");
  }
  return url.origin;
}

export const postHogConnector: ConnectorClient<PostHogCredentials> = {
  provider: "posthog",
  async verify(credentials): Promise<ConnectorVerification> {
    const host = normalizeHost(credentials.host);
    const response = await fetch(
      `${host}/api/projects/${encodeURIComponent(credentials.projectId)}/`,
      {
        headers: {
          Authorization: `Bearer ${credentials.personalApiKey}`,
        },
        cache: "no-store",
      },
    );
    const body = (await checkedJson(response, "posthog")) as {
      name?: string;
    };

    return {
      ok: true,
      provider: "posthog",
      accountLabel: body.name ?? credentials.projectId,
      message:
        "Project verified. Scheduled syncs use bounded aggregate queries only.",
      checkedAt: new Date().toISOString(),
    };
  },
};
