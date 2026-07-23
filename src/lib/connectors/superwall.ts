import {
  checkedJson,
  type ConnectorClient,
  type ConnectorVerification,
} from "@/lib/connectors/types";

export interface SuperwallCredentials {
  apiKey: string;
  projectId: string;
}

export const superwallConnector: ConnectorClient<SuperwallCredentials> = {
  provider: "superwall",
  async verify(credentials): Promise<ConnectorVerification> {
    const response = await fetch(
      `https://api.superwall.com/v2/projects/${encodeURIComponent(
        credentials.projectId,
      )}`,
      {
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );
    const body = (await checkedJson(response, "superwall")) as {
      name?: string;
      data?: { name?: string };
    };

    return {
      ok: true,
      provider: "superwall",
      accountLabel: body.data?.name ?? body.name ?? credentials.projectId,
      message: "Project verified with Superwall API v2.",
      checkedAt: new Date().toISOString(),
    };
  },
};
