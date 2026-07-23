import { expect, test } from "@playwright/test";

test("River Atlas demo exposes the core growth loop", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Growth River" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What to fix next" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Growth Replay" }),
  ).toBeVisible();
  await expect(
    page.getByText("First confirmed bottleneck", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Activate: 78K/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "View methodology" }).click();
  await expect(
    page.getByRole("dialog", { name: "Evidence before advice" }),
  ).toBeVisible();
});

test("opportunity, lab and source workflows are interactive", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Test screenshot promise" }).click();
  await page.getByRole("button", { name: "Open evidence" }).click();
  await expect(
    page.getByRole("heading", { name: "Test screenshot promise" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Lab" }).click();
  await page.getByRole("button", { name: "New experiment" }).click();
  await expect(page.getByText("Draft created.")).toBeVisible();
  await page.getByRole("button", { name: "Open" }).first().click();
  await expect(
    page.getByRole("dialog").getByText(
      "This is a read-only experiment record.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close experiment" }).click();

  await page.getByRole("button", { name: "Sources" }).click();
  await page.getByRole("button", { name: /RevenueCat/ }).first().click();
  await expect(page.getByRole("heading", { name: "RevenueCat" })).toBeVisible();
  await expect(page.getByText("Envelope encrypted")).toBeVisible();
});

test("reduced motion keeps replay directly controllable", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Play growth replay" }).click();
  await expect(page.getByText("Period start")).toBeVisible();
  await context.close();
});

test("plan chooser exposes the live Paddle catalog prices", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Choose plan" }).click();

  const dialog = page.getByRole("dialog", {
    name: "Keep your growth map running",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("$12.99")).toBeVisible();
  await expect(dialog.getByText("$129", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: /Monthly/ }).click();
  await expect(
    dialog.getByRole("button", { name: "Continue with Monthly" }),
  ).toBeVisible();
});

test("trial signup creates a real backend workspace and can delete it", async ({
  page,
}) => {
  const email = `river-atlas-e2e-${Date.now()}@example.com`;

  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("RiverAtlas!2026");
  await page.getByRole("button", { name: "Start 14-day trial" }).click();
  await page.waitForURL("/");

  await expect(page.getByText("My AppClimb workspace")).toBeVisible();
  await page.getByRole("button", { name: "Sources" }).click();
  await expect(page.getByText("0 of 5 sources connected")).toBeVisible();
  await expect(page.getByText("Not connected").first()).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(
    page.getByRole("dialog", { name: "Workspace control" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByText("DEMO WORKSPACE").first()).toBeVisible();
});
