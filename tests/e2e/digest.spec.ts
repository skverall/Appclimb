import { expect, test } from "./runtime-test";

test("unsubscribe page confirms before stopping, and handles bad links", async ({ page, request }) => {
  await page.goto("/unsubscribe");
  await expect(page.getByRole("heading", { name: "This link doesn’t work" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  // A link with a user and token asks first (mail scanners can't unsubscribe).
  await page.goto("/unsubscribe?u=user-1&t=not-a-real-token");
  await expect(page.getByRole("heading", { name: "Stop the weekly email?" })).toBeVisible();
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  // e2e has no D1 or secret, so the token can't verify.
  await expect(page).toHaveURL(/\/unsubscribe\?error=1$/);
  await expect(page.getByRole("heading", { name: "This link doesn’t work" })).toBeVisible();

  // One-click (RFC 8058) with a bad token is refused; the cron route is closed.
  const oneClick = await request.post("/api/digest/unsubscribe?u=user-1&t=bad", {
    form: { "List-Unsubscribe": "One-Click" },
  });
  expect(oneClick.status()).toBe(400);
  expect((await request.post("/api/digest/run")).status()).toBe(503);
});

test("Pro users can switch the weekly email off from the account menu", async ({ page }) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        user: { id: "u1", email: "pro@example.com", name: "Pro" },
        plan: "pro",
        subscription: { status: "active", current_period_end: null, cancel_at_period_end: false },
      }),
    }),
  );
  await page.route("**/api/sync?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: 0, json: null, updated_at: null }),
    }),
  );
  const posts: unknown[] = [];
  await page.route("**/api/digest/prefs", async (route) => {
    if (route.request().method() === "POST") {
      posts.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: true, eligible: true }),
    });
  });

  await page.goto("/pricing");
  await page.locator(".account-menu-trigger").click();
  const toggle = page.getByRole("menuitemcheckbox", { name: /Weekly email/ });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(posts).toEqual([{ enabled: false }]);
});
