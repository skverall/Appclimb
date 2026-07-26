import { base64UrlEncode } from "./crypto";

const supportedProviders = new Set([
  "app-store-connect",
  "revenuecat",
  "posthog",
  "superwall",
]);

const postHogOrigins = new Set([
  "https://us.posthog.com",
  "https://eu.posthog.com",
]);

export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 502,
    public readonly retryable = false,
  ) {
    super(code);
  }
}

export interface Verification {
  provider: string;
  accountLabel?: string;
  message: string;
  checkedAt: string;
}

export function isSupportedProvider(provider: string): boolean {
  return supportedProviders.has(provider);
}

function requiredString(
  credentials: Record<string, unknown>,
  key: string,
): string {
  const value = credentials[key];
  if (typeof value !== "string" || !value.trim() || value.length > 12_000) {
    throw new ProviderError("invalid_credentials_payload", 400);
  }
  return value.trim();
}

async function getProviderJSON(
  endpoint: string,
  token: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    method: "GET",
    redirect: "manual",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "user-agent": "AppClimb/2.0 Cloudflare",
    },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProviderError(
      "provider_rejected_credentials",
      response.status,
      response.status === 429 || response.status >= 500,
    );
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > 2 * 1024 * 1024) {
    await response.body?.cancel();
    throw new ProviderError("provider_response_too_large", 502, true);
  }
  const text = await response.text();
  if (text.length > 2 * 1024 * 1024) {
    throw new ProviderError("provider_response_too_large", 502, true);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ProviderError("invalid_provider_response", 502, true);
  }
}

function pemBytes(pem: string): Uint8Array {
  const compact = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/gu, "");
  if (!compact || pem.includes("BEGIN EC PRIVATE KEY")) {
    throw new ProviderError("invalid_apple_private_key", 400);
  }
  try {
    const binary = atob(compact);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new ProviderError("invalid_apple_private_key", 400);
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export async function appleToken(
  issuerId: string,
  keyId: string,
  privateKey: string,
): Promise<string> {
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      toArrayBuffer(pemBytes(privateKey)),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new ProviderError("invalid_apple_private_key", 400);
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }),
    ),
  );
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({
        iss: issuerId,
        iat: now,
        exp: now + 15 * 60,
        aud: "appstoreconnect-v1",
      }),
    ),
  );
  const unsigned = `${header}.${payload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      toArrayBuffer(new TextEncoder().encode(unsigned)),
    ),
  );
  if (signature.length !== 64) {
    throw new ProviderError("invalid_apple_private_key", 400);
  }
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

export async function verifyProvider(
  provider: string,
  credentials: Record<string, unknown>,
): Promise<Verification> {
  if (!isSupportedProvider(provider)) {
    throw new ProviderError("unsupported_provider", 400);
  }
  const checkedAt = new Date().toISOString();
  if (provider === "app-store-connect") {
    const appId = requiredString(credentials, "appId");
    const issuerId = requiredString(credentials, "issuerId");
    const keyId = requiredString(credentials, "keyId");
    const privateKey = requiredString(credentials, "privateKey");
    const token = await appleToken(issuerId, keyId, privateKey);
    const response = await getProviderJSON(
      `https://api.appstoreconnect.apple.com/v1/apps/${encodeURIComponent(appId)}`,
      token,
    );
    const data = response.data as
      | { attributes?: { name?: unknown } }
      | undefined;
    const accountLabel =
      typeof data?.attributes?.name === "string" && data.attributes.name.trim()
        ? data.attributes.name.trim()
        : appId;
    return {
      provider,
      accountLabel,
      message: "Key verified. Apple analytics availability is checked by the worker.",
      checkedAt,
    };
  }

  if (provider === "revenuecat") {
    const apiKey = requiredString(credentials, "apiKey");
    const projectId = requiredString(credentials, "projectId");
    await getProviderJSON(
      `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}/charts/revenue/options`,
      apiKey,
    );
    return {
      provider,
      accountLabel: projectId,
      message: "V2 key verified with Charts read access.",
      checkedAt,
    };
  }

  if (provider === "posthog") {
    const personalApiKey = requiredString(credentials, "personalApiKey");
    const projectId = requiredString(credentials, "projectId");
    const host = requiredString(credentials, "host").replace(/\/+$/u, "");
    let origin: string;
    try {
      origin = new URL(host).origin;
    } catch {
      throw new ProviderError("invalid_posthog_host", 400);
    }
    if (!postHogOrigins.has(origin) || host !== origin) {
      throw new ProviderError("invalid_posthog_host", 400);
    }
    const response = await getProviderJSON(
      `${origin}/api/projects/${encodeURIComponent(projectId)}/`,
      personalApiKey,
    );
    const label =
      typeof response.name === "string" && response.name.trim()
        ? response.name.trim()
        : projectId;
    return {
      provider,
      accountLabel: label,
      message: "Project verified. Syncs use bounded aggregate queries only.",
      checkedAt,
    };
  }

  const apiKey = requiredString(credentials, "apiKey");
  const projectId = requiredString(credentials, "projectId");
  const response = await getProviderJSON(
    `https://api.superwall.com/v2/projects/${encodeURIComponent(projectId)}`,
    apiKey,
  );
  const data = response.data as { name?: unknown } | undefined;
  const labelCandidates = [data?.name, response.name, projectId];
  const label =
    labelCandidates.find(
      (value): value is string =>
        typeof value === "string" && Boolean(value.trim()),
    ) ?? projectId;
  return {
    provider,
    accountLabel: label.trim(),
    message: "Project verified with the read-only Superwall API.",
    checkedAt,
  };
}
