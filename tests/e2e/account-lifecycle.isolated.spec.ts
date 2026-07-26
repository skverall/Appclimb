import { expect, test } from "./runtime-test";

test("trial signup creates an isolated backend workspace and can delete it", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const email = `river-atlas-e2e-${Date.now()}@example.com`;
  const initialPassword = "RiverAtlas!2026";
  const updatedPassword = "Cloudflare!2026";

  await page.goto("/login");
  await page.locator("#signup-email").fill(email);
  await page.locator("#signup-password").fill(initialPassword);
  await page.locator(".auth-submit").click();
  await page.waitForURL((url) => url.pathname === "/");

  await expect(page.getByText("My AppClimb workspace")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Build your first truthful growth map",
    }),
  ).toBeVisible();
  await expect(page.getByText("2.41M")).toHaveCount(0);
  await expect(page.getByText(/synthetic sample data/i)).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Open Sources to connect App Store Connect",
    })
    .click();
  await expect(page.getByRole("textbox", { name: /Apple app ID/ })).toBeVisible();
  await expect(page.getByText("0 of 4 systems have live data")).toBeVisible();
  await expect(page.getByText("Not connected").first()).toBeVisible();
  await page.getByRole("button", { name: "Close source" }).click();

  await page
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Profile & billing" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Change password" }).click();
  await page.getByLabel("Current password").fill(initialPassword);
  await page.getByLabel("New password", { exact: true }).fill(updatedPassword);
  await page.getByLabel("Confirm new password").fill(updatedPassword);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("Password updated")).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole("button", { name: "Sign in again" }).click();
  await page.waitForURL("/login");

  await page
    .locator(".auth-mode")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(updatedPassword);
  await page.locator(".auth-submit").click();
  await page.waitForURL((url) => url.pathname === "/");
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Profile & billing" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByText("DEMO WORKSPACE").first()).toBeVisible();
});
