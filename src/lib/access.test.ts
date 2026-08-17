import { describe, expect, it } from "vitest";

import {
  AUTH_COPY,
  accountsAreLive,
  assistantRequiresSignIn,
  canTrackApps,
  canUseAssistant,
  canUseExplorer,
  resolveAccessRole,
} from "./access";

describe("accountsAreLive", () => {
  it("is live when the Pro UI flag is on, even before /api/me", () => {
    expect(accountsAreLive(true, false)).toBe(true);
  });

  it("is live when the backend reports configured, even without the flag", () => {
    expect(accountsAreLive(false, true)).toBe(true);
  });

  it("stays off when neither the flag nor the backend is ready", () => {
    expect(accountsAreLive(false, false)).toBe(false);
  });
});

describe("resolveAccessRole", () => {
  it("treats unsigned visitors as guests", () => {
    expect(resolveAccessRole({ signedIn: false, isPro: false })).toBe("guest");
    expect(resolveAccessRole({ signedIn: false, isPro: true })).toBe("guest");
  });

  it("treats a signed-in user without Pro as free", () => {
    expect(resolveAccessRole({ signedIn: true, isPro: false })).toBe("free");
  });

  it("treats a signed-in Pro subscriber as pro", () => {
    expect(resolveAccessRole({ signedIn: true, isPro: true })).toBe("pro");
  });
});

describe("feature gates", () => {
  it("always leaves Keyword Explorer open", () => {
    expect(canUseExplorer()).toBe(true);
  });

  it("lets everyone track and chat when accounts are not live", () => {
    expect(canTrackApps("guest", false)).toBe(true);
    expect(canUseAssistant("guest", false)).toBe(true);
  });

  it("blocks guests from tracking and the assistant once accounts are live", () => {
    expect(canTrackApps("guest", true)).toBe(false);
    expect(canUseAssistant("guest", true)).toBe(false);
    expect(canTrackApps("free", true)).toBe(true);
    expect(canUseAssistant("pro", true)).toBe(true);
  });

  it("requires a session for chat once D1 is bound", () => {
    expect(assistantRequiresSignIn(true, false)).toBe(true);
    expect(assistantRequiresSignIn(true, true)).toBe(false);
    expect(assistantRequiresSignIn(false, false)).toBe(false);
  });
});

describe("AUTH_COPY", () => {
  it("covers every intent with a title and a reason to sign in", () => {
    for (const intent of ["default", "track", "assistant", "upgrade"] as const) {
      expect(AUTH_COPY[intent].title.length).toBeGreaterThan(8);
      expect(AUTH_COPY[intent].subtitle.length).toBeGreaterThan(20);
    }
  });
});
