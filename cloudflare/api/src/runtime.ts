export const secretNames = [
  "JWT_SECRET",
  "ENVELOPE_MASTER_KEY",
  "INTERNAL_SYNC_TOKEN",
  "PADDLE_WEBHOOK_SECRET",
  "PADDLE_PRODUCT_ID",
  "PADDLE_PRODUCT_IDENTITY",
  "PADDLE_ALLOWED_PRICE_IDS",
] as const;

export type SecretName = (typeof secretNames)[number];

export function readSecret(env: Cloudflare.Env, name: SecretName): string {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" ? value : "";
}

export function requireSecret(env: Cloudflare.Env, name: SecretName): string {
  const value = readSecret(env, name);
  if (!value) {
    throw new Error(`missing_secret:${name}`);
  }
  return value;
}

export function asBoolean(value: string): boolean {
  return value === "true";
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function log(
  level: "info" | "warn" | "error",
  event: string,
  metadata: Record<string, unknown> = {},
): void {
  const payload = JSON.stringify({
    level,
    event,
    service: "appclimb-api",
    timestamp: new Date().toISOString(),
    ...metadata,
  });
  if (level === "error") {
    console.error(payload);
  } else if (level === "warn") {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}
