import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  decryptCredentialPayload,
  encryptCredentialPayload,
} from "@/lib/crypto-envelope";

describe("credential envelope encryption", () => {
  it("round-trips credentials without leaving plaintext in the envelope", () => {
    const masterKey = randomBytes(32).toString("base64");
    const credentials = {
      apiKey: "secret-value-that-must-never-leak",
      projectId: "project-1",
    };
    const envelope = encryptCredentialPayload(credentials, masterKey);

    expect(JSON.stringify(envelope)).not.toContain(credentials.apiKey);
    expect(decryptCredentialPayload(envelope, masterKey)).toEqual(credentials);
  });

  it("rejects an invalid master key", () => {
    expect(() =>
      encryptCredentialPayload({ token: "secret" }, "not-a-key"),
    ).toThrow("base64-encoded 32-byte key");
  });

  it("fails closed when ciphertext is modified", () => {
    const masterKey = randomBytes(32).toString("base64");
    const envelope = encryptCredentialPayload({ token: "secret" }, masterKey);
    envelope.ciphertext = Buffer.from("tampered").toString("base64");

    expect(() => decryptCredentialPayload(envelope, masterKey)).toThrow();
  });
});
