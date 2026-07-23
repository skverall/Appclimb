import {
  checkedJson,
  type ConnectorClient,
  type ConnectorVerification,
} from "@/lib/connectors/types";

export interface RevenueCatCredentials {
  apiKey: string;
  projectId: string;
}

export const revenueCatConnector: ConnectorClient<RevenueCatCredentials> = {
  provider: "revenuecat",
  async verify(credentials): Promise<ConnectorVerification> {
    const response = await fetch(
      `https://api.revenuecat.com/v2/projects/${encodeURIComponent(
        credentials.projectId,
      )}/charts/revenue/options`,
      {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
        cache: "no-store",
      },
    );
    await checkedJson(response, "revenuecat");

    return {
      ok: true,
      provider: "revenuecat",
      accountLabel: credentials.projectId,
      message: "V2 key verified with charts read access.",
      checkedAt: new Date().toISOString(),
    };
  },
};
