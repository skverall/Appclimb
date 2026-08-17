import { expect, test } from "./runtime-test";

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
