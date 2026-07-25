import { expect, test } from "./runtime-test";

test("trial signup creates an isolated backend workspace and can delete it", async ({
  page,
}) => {
  const email = `river-atlas-e2e-${Date.now()}@example.com`;

  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("RiverAtlas!2026");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await page.waitForURL("/");

  await expect(page.getByText("My AppClimb workspace")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Build your first truthful growth map",
    }),
  ).toBeVisible();
  await expect(page.getByText("2.41M")).toHaveCount(0);
  await expect(page.getByText(/synthetic sample data/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Sources" }).click();
  await expect(page.getByText("0 of 5 sources connected")).toBeVisible();
  await expect(page.getByText("Not connected").first()).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(
    page.getByRole("dialog", { name: "Profile & billing" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByText("DEMO WORKSPACE").first()).toBeVisible();
});
