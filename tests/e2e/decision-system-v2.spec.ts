import { expect, test } from "./runtime-test";

test.describe("AppClimb Decision System V2 E2E Specs", () => {
  test("renders public landing page and decision features accurately", async ({ page }) => {
    await page.goto("/ios-subscription-analytics");

    await expect(page).toHaveTitle(
      /iOS Subscription Analytics and Growth Diagnosis/,
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "See the growth journey—not another wall of dashboards.",
      }),
    ).toBeVisible();
  });
});
