import { expect, test } from "./runtime-test";

test("the guide's metadata checker counts, flags waste, and fixes the keyword field", async ({
  page,
}) => {
  await page.goto("/guides/keyword-research");
  await expect(
    page.getByRole("heading", { level: 1, name: /practical guide to App Store keyword research/i }),
  ).toBeVisible();

  // Diagrams render as part of the page, not as images to download.
  await expect(page.getByRole("img", { name: /Weekly loop/i })).toBeVisible();

  const field = page.getByLabel(/Keyword field/i);
  await field.fill("habit, ritual,habit,journal");
  await expect(page.getByText(/Spaces after commas waste 1 character/)).toBeVisible();
  await expect(page.getByText(/Repeats habit/)).toBeVisible();
  await expect(page.getByText(/Already in your app name: habit, ritual/)).toBeVisible();

  await page.getByRole("button", { name: /Fix the keyword field/i }).click();
  await expect(field).toHaveValue("journal");
  await expect(page.getByRole("button", { name: /Fix the keyword field/i })).toHaveCount(0);

  // The table of contents follows the reader.
  await page.evaluate(() => document.getElementById("metadata")?.scrollIntoView({ block: "start" }));
  await expect(
    page.getByRole("navigation", { name: "Guide sections" }).locator('a[aria-current="location"]'),
  ).toHaveText(/Write metadata that indexes/);
});
