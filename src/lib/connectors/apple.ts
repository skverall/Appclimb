import { createPrivateKey, sign } from "node:crypto";

import {
  checkedJson,
  type ConnectorClient,
  type ConnectorVerification,
} from "@/lib/connectors/types";

export interface AppleCredentials {
  // appId is required for sync (the worker needs it to navigate analytics
  // reports) but optional for credential verification, which calls the generic
  // /v1/apps endpoint and does not need a specific app.
  appId?: string;
  issuerId: string;
  keyId: string;
  privateKey: string;
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export function createAppleToken(
  credentials: AppleCredentials,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = base64Url(
    JSON.stringify({ alg: "ES256", kid: credentials.keyId, typ: "JWT" }),
  );
  const payload = base64Url(
    JSON.stringify({
      iss: credentials.issuerId,
      iat: nowSeconds,
      exp: nowSeconds + 15 * 60,
      aud: "appstoreconnect-v1",
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: createPrivateKey(credentials.privateKey),
    dsaEncoding: "ieee-p1363",
  });

  return `${unsigned}.${base64Url(signature)}`;
}

export const appleConnector: ConnectorClient<AppleCredentials> = {
  provider: "app-store-connect",
  async verify(credentials): Promise<ConnectorVerification> {
    const token = createAppleToken(credentials);
    const response = await fetch(
      "https://api.appstoreconnect.apple.com/v1/apps?limit=1",
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const body = (await checkedJson(
      response,
      "app-store-connect",
    )) as { data?: { attributes?: { name?: string } }[] };

    return {
      ok: true,
      provider: "app-store-connect",
      accountLabel: body.data?.[0]?.attributes?.name,
      message:
        "Key verified. Analytics report availability is checked asynchronously.",
      checkedAt: new Date().toISOString(),
    };
  },
};
