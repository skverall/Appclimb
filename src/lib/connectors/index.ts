import { appleConnector } from "@/lib/connectors/apple";
import { postHogConnector } from "@/lib/connectors/posthog";
import { revenueCatConnector } from "@/lib/connectors/revenuecat";
import { superwallConnector } from "@/lib/connectors/superwall";
import type {
  ConnectorProvider,
  ConnectorVerification,
} from "@/lib/connectors/types";

export async function verifyConnector(
  provider: ConnectorProvider,
  credentials: Record<string, string>,
): Promise<ConnectorVerification> {
  switch (provider) {
    case "app-store-connect":
      return appleConnector.verify({
        issuerId: credentials.issuerId,
        keyId: credentials.keyId,
        privateKey: credentials.privateKey,
      });
    case "revenuecat":
      return revenueCatConnector.verify({
        apiKey: credentials.apiKey,
        projectId: credentials.projectId,
      });
    case "posthog":
      return postHogConnector.verify({
        personalApiKey: credentials.personalApiKey,
        projectId: credentials.projectId,
        host: credentials.host,
      });
    case "superwall":
      return superwallConnector.verify({
        apiKey: credentials.apiKey,
        projectId: credentials.projectId,
      });
  }
}

export type { ConnectorProvider, ConnectorVerification };
