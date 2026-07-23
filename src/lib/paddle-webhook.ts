import { createHmac, timingSafeEqual } from "node:crypto";

interface SignatureParts {
  timestamp: number;
  signatures: string[];
}

export function parsePaddleSignature(header: string): SignatureParts {
  const parts = header.split(";").reduce<Record<string, string[]>>(
    (result, entry) => {
      const [key, value] = entry.split("=", 2);
      if (key && value) {
        result[key] = [...(result[key] ?? []), value];
      }
      return result;
    },
    {},
  );
  const timestamp = Number(parts.ts?.[0]);
  const signatures = parts.h1 ?? [];

  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new Error("Malformed Paddle-Signature header");
  }

  return { timestamp, signatures };
}

export function verifyPaddleSignature({
  rawBody,
  header,
  secret,
  now = Date.now(),
  toleranceSeconds = 5,
}: {
  rawBody: string;
  header: string;
  secret: string;
  now?: number;
  toleranceSeconds?: number;
}): boolean {
  const { timestamp, signatures } = parsePaddleSignature(header);
  const ageSeconds = Math.abs(now / 1000 - timestamp);

  if (ageSeconds > toleranceSeconds) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}:${rawBody}`, "utf8")
    .digest();

  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) {
      return false;
    }
    const provided = Buffer.from(signature, "hex");
    return (
      provided.byteLength === expected.byteLength &&
      timingSafeEqual(provided, expected)
    );
  });
}
