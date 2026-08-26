import { expect, test } from "@playwright/test";

test.describe("Admin Analytics & Pulse", () => {
  test("unauthenticated guest sees the admin gate", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("h2")).toContainText("Admin Access Required");
    await expect(page.locator("button", { hasText: "Sign in as Admin" })).toBeVisible();
  });

  test("analytics beacon does not crash pages or trigger errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    expect(consoleErrors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
  });
});
