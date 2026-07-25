import { describe, expect, it } from "vitest";

import {
  authFormSchema,
  connectorCredentialsSchema,
  connectorProviderSchema,
} from "@/lib/validation";

/**
 * These schemas gate the login server action and the three connector routes,
 * so they are the boundary every credential and sign-in attempt crosses.
 */
describe("connectorProviderSchema", () => {
  it("accepts only the four supported providers", () => {
    for (const provider of [
      "app-store-connect",
      "revenuecat",
      "posthog",
      "superwall",
    ]) {
      expect(connectorProviderSchema.safeParse(provider).success).toBe(true);
    }
    for (const provider of ["datafast", "amplitude", "", "POSTHOG"]) {
      expect(connectorProviderSchema.safeParse(provider).success).toBe(false);
    }
  });
});

describe("connectorCredentialsSchema", () => {
  it("accepts a complete App Store Connect credential set", () => {
    expect(
      connectorCredentialsSchema.safeParse({
        provider: "app-store-connect",
        credentials: {
          appId: "6743210987",
          issuerId: "69a6de70-1111-2222-3333-444455556666",
          keyId: "ABCD1234EF",
          privateKey: "-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects a credential set that is missing a required field", () => {
    expect(
      connectorCredentialsSchema.safeParse({
        provider: "revenuecat",
        credentials: { apiKey: "sk_live_example" },
      }).success,
    ).toBe(false);
  });

  it("rejects blank and whitespace-only secrets", () => {
    for (const apiKey of ["", "   ", "\n\t"]) {
      expect(
        connectorCredentialsSchema.safeParse({
          provider: "superwall",
          credentials: { apiKey, projectId: "proj", applicationId: "app" },
        }).success,
      ).toBe(false);
    }
  });

  it("rejects a RevenueCat-shaped payload sent as Superwall", () => {
    expect(
      connectorCredentialsSchema.safeParse({
        provider: "superwall",
        credentials: { apiKey: "key", projectId: "proj" },
      }).success,
    ).toBe(false);
  });

  it("requires a valid URL for the PostHog host", () => {
    const credentials = {
      personalApiKey: "phx_example",
      projectId: "490129",
    };
    expect(
      connectorCredentialsSchema.safeParse({
        provider: "posthog",
        credentials: { ...credentials, host: "https://us.posthog.com" },
      }).success,
    ).toBe(true);
    expect(
      connectorCredentialsSchema.safeParse({
        provider: "posthog",
        credentials: { ...credentials, host: "us.posthog.com" },
      }).success,
    ).toBe(false);
  });

  it("accepts the optional PostHog OAuth fields only in their stated shape", () => {
    const base = {
      personalApiKey: "phx_example",
      projectId: "490129",
      host: "https://us.posthog.com",
    };
    expect(
      connectorCredentialsSchema.safeParse({
        provider: "posthog",
        credentials: {
          ...base,
          authMethod: "oauth",
          oauthRefreshToken: "refresh",
          oauthExpiresAt: "2026-07-25T14:42:00.000Z",
          oauthClientId: "https://appclimb.app/api/oauth/posthog/client",
        },
      }).success,
    ).toBe(true);
    expect(
      connectorCredentialsSchema.safeParse({
        provider: "posthog",
        credentials: { ...base, oauthExpiresAt: "25 July 2026" },
      }).success,
    ).toBe(false);
    expect(
      connectorCredentialsSchema.safeParse({
        provider: "posthog",
        credentials: { ...base, authMethod: "personal-key" },
      }).success,
    ).toBe(false);
  });

  it("caps secret length so an oversized body cannot be stored", () => {
    expect(
      connectorCredentialsSchema.safeParse({
        provider: "revenuecat",
        credentials: { apiKey: "a".repeat(12_001), projectId: "proj" },
      }).success,
    ).toBe(false);
  });
});

describe("authFormSchema", () => {
  it("accepts a valid sign-in payload", () => {
    expect(
      authFormSchema.safeParse({
        email: "builder@example.com",
        password: "correct-horse",
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed email address", () => {
    for (const email of ["builder", "builder@", "@example.com", ""]) {
      expect(
        authFormSchema.safeParse({ email, password: "correct-horse" }).success,
      ).toBe(false);
    }
  });

  it("enforces the password length bounds", () => {
    expect(
      authFormSchema.safeParse({
        email: "builder@example.com",
        password: "short7c",
      }).success,
    ).toBe(false);
    expect(
      authFormSchema.safeParse({
        email: "builder@example.com",
        password: "a".repeat(129),
      }).success,
    ).toBe(false);
    expect(
      authFormSchema.safeParse({
        email: "builder@example.com",
        password: "a".repeat(128),
      }).success,
    ).toBe(true);
  });
});
