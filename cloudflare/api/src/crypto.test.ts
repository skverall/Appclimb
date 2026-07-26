import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./crypto";

const GO_ARGON2ID_VECTOR =
  "$argon2id$v=19$m=65536,t=3,p=2$AAECAwQFBgcICQoLDA0ODw$jbCPLPlvn1KB30ErB0+lEWnjTvexmRcwfBp//uIu3Jo";

describe("password compatibility", () => {
  it(
    "creates and verifies the Worker-safe OWASP Argon2id profile",
    async () => {
      const encoded = await hashPassword("Cloudflare!2026");

      expect(encoded).toMatch(
        /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/u,
      );
      await expect(verifyPassword(encoded, "Cloudflare!2026")).resolves.toBe(
        true,
      );
      await expect(verifyPassword(encoded, "wrong password")).resolves.toBe(
        false,
      );
    },
    30_000,
  );

  it(
    "verifies the same Argon2id encoding as the legacy Go API",
    async () => {
      await expect(
        verifyPassword(GO_ARGON2ID_VECTOR, "Cloudflare!2026"),
      ).resolves.toBe(true);
      await expect(
        verifyPassword(GO_ARGON2ID_VECTOR, "wrong password"),
      ).resolves.toBe(false);
    },
    30_000,
  );
});
