import { describe, expect, it } from "vitest";

import {
  backendIdentitySchema,
  isBackendIdentity,
} from "@/lib/identity-schema";

const identity = {
  userId: "user-1",
  email: "owner@example.com",
  workspaceId: "workspace-1",
  workspaceName: "Example workspace",
  role: "owner",
  trialEndsAt: "2026-08-08T12:00:00Z",
  subscriptionStatus: "trialing",
};

describe("backendIdentitySchema", () => {
  it("accepts a complete backend identity", () => {
    expect(isBackendIdentity(identity)).toBe(true);
  });

  it("rejects a partial identity before client rendering", () => {
    expect(
      isBackendIdentity({
        email: identity.email,
        workspaceId: identity.workspaceId,
      }),
    ).toBe(false);
  });

  it("rejects malformed email and trial timestamps", () => {
    expect(
      backendIdentitySchema.safeParse({
        ...identity,
        email: "not-an-email",
        trialEndsAt: "soon",
      }).success,
    ).toBe(false);
  });
});
