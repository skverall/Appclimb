import { dismissExpectedConsoleErrors, expect, test } from "./runtime-test";

const FREE_LIMITS = {
  explorerChecksPerDay: 8,
  aiMessagesPerDay: 5,
  popularityPerDay: 30,
  trackedApps: 1,
  keywordsPerApp: 25,
  historyDays: 30,
  cloudSync: false,
};

async function mockGuestAccount(page: import("@playwright/test").Page) {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        user: null,
        plan: "free",
        limits: FREE_LIMITS,
        subscription: null,
      }),
    });
  });
}

test("guest can search keywords but must sign in to track or chat", async ({
  page,
}) => {
  await mockGuestAccount(page);
  await page.goto("/");

  await expect(page.getByText("Guest", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sign in$/i }).first()).toBeVisible();
  await expect(
    page.getByText(/You're using AppClimb as a/i),
  ).toBeVisible();

  // Explorer stays open — no login wall on search.
  await expect(page.getByPlaceholder(/meditation/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze", exact: true })).toBeVisible();

  // Tracking is gated. The add-app dialog must not open for a guest.
  await page.getByRole("button", { name: /Sign in to track/i }).first().click();
  await expect(
    page.getByRole("heading", { name: /Sign in to track an app/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Close sign in dialog/i }).click();
  await expect(page.getByRole("heading", { name: "Add App" })).toHaveCount(0);

  await page.getByRole("button", { name: /Tracked Apps/i }).click();
  await expect(
    page.getByRole("heading", { name: /Tracking needs a free account/i }),
  ).toBeVisible();
});

test("guest assistant page asks for a free account instead of a composer", async ({
  page,
}) => {
  await mockGuestAccount(page);
  await page.goto("/assistant");

  await expect(page.getByText(/Sign in to chat/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign in free/i })).toBeVisible();
  await expect(page.getByLabel("Message the ASO assistant")).toHaveCount(0);

  await page.getByRole("button", { name: /Sign in free/i }).click();
  await expect(
    page.getByRole("heading", { name: /Sign in to use the assistant/i }),
  ).toBeVisible();
});

test("auth dialog traps keyboard focus and restores it on close", async ({
  page,
}) => {
  await mockGuestAccount(page);
  await page.goto("/");

  const opener = page.getByRole("button", { name: /Sign in to track/i }).first();
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole("dialog", {
    name: /Sign in to track an app/i,
  });
  await expect(dialog).toBeVisible();

  // Tab cycles inside the dialog: focus must never escape into the page.
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const el = document.activeElement;
      return Boolean(el && el.closest('[role="dialog"]'));
    });
    if (!inside) {
      throw new Error(
        `focus escaped the dialog on Tab #${i + 1}`,
      );
    }
  }

  // Shift+Tab wraps backward the same way.
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Shift+Tab");
    const inside = await page.evaluate(() => {
      const el = document.activeElement;
      return Boolean(el && el.closest('[role="dialog"]'));
    });
    if (!inside) {
      throw new Error(
        `focus escaped the dialog on Shift+Tab #${i + 1}`,
      );
    }
  }

  // Escape closes the dialog and returns focus to the opener.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("auth dialog fits the 320px viewport", async ({ page }) => {
  await mockGuestAccount(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");

  await page.getByRole("button", { name: /^Sign in$/i }).first().click();
  const dialog = page.getByRole("dialog", { name: /Sign in to AppClimb/i });
  await expect(dialog).toBeVisible();

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }

  // The primary fields stay reachable at this width.
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Email me a sign-in link/i }),
  ).toBeVisible();
});

test("auth dialog keeps the focus trap at 320px and on errors", async ({
  page,
}) => {
  await mockGuestAccount(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.route("**/api/auth/magic-link", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Email is not configured yet.", configured: false }),
    });
  });

  await page.goto("/");
  const opener = page.getByRole("button", { name: /^Sign in$/i }).first();
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: /Sign in to AppClimb/i });
  await expect(dialog).toBeVisible();

  // Trigger a visible error inside the dialog.
  await page.getByLabel("Email").fill("dev@example.com");
  await page.getByRole("button", { name: /Email me a sign-in link/i }).click();
  await expect(page.locator(".keyword-error")).toContainText(/Email is not configured/i, {
    timeout: 10_000,
  });
  dismissExpectedConsoleErrors(page, [/Failed to load resource.*503/]);

  // The trap holds even with the error visible at 320px.
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const el = document.activeElement;
      return Boolean(el && el.closest('[role="dialog"]'));
    });
    if (!inside) throw new Error(`focus escaped on Tab #${i + 1}`);
  }

  // Escaping closes the dialog and restores focus to the opener.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("auth dialog fits and stays centered at 1024px and 1920px", async ({
  page,
}) => {
  await mockGuestAccount(page);

  for (const [width, height] of [
    [1024, 768],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: /^Sign in$/i }).first().click();
    const dialog = page.getByRole("dialog", { name: /Sign in to AppClimb/i });
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      // Centered on the horizontal midpoint.
      expect(
        Math.abs(box.x + box.width / 2 - width / 2),
      ).toBeLessThanOrEqual(24);
    }

    // The fields remain reachable at both widths.
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Email me a sign-in link/i }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("pre-monetization mode shows no account chrome and no gates", async ({
  page,
}) => {
  // No /api/me mock: the real route reports configured:false (accounts off).
  await page.goto("/");
  await expect(page.getByPlaceholder(/meditation/)).toBeVisible();

  // No sign-in chrome in the header.
  await expect(page.getByRole("button", { name: /^Sign in$/i })).toHaveCount(0);
  await expect(page.getByText("Guest", { exact: true })).toHaveCount(0);

  // The assistant composer is open (no auth gate) in pre-monetization mode.
  await page.goto("/assistant");
  await expect(page.getByLabel("Message the ASO assistant")).toBeVisible();
  await expect(page.getByText(/Sign in to chat/i)).toHaveCount(0);
});

test("magic-link 429 at 320px: error shows and the trap holds", async ({
  page,
}) => {
  await mockGuestAccount(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.route("**/api/auth/magic-link", async (route) => {
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Too many sign-in emails. Try again later.",
        retryAfterSec: 3600,
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /^Sign in$/i }).first().click();
  const dialog = page.getByRole("dialog", { name: /Sign in to AppClimb/i });
  await expect(dialog).toBeVisible();

  await page.getByLabel("Email").fill("dev@example.com");
  await page.getByRole("button", { name: /Email me a sign-in link/i }).click();
  await expect(page.locator(".keyword-error")).toContainText(
    /Too many sign-in emails/i,
    { timeout: 10_000 },
  );

  // The trap holds with the rate-limit error visible at 320px.
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const el = document.activeElement;
      return Boolean(el && el.closest('[role="dialog"]'));
    });
    if (!inside) throw new Error(`focus escaped on Tab #${i + 1}`);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
