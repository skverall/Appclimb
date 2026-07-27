import { expect, test } from "./runtime-test";

/**
 * Journey B — Website (Decision System V2 plan, section 15.3), browser half.
 *
 * The Playwright environment runs the real Next build with the backend
 * deliberately pointed at a dead port (see playwright.config.ts), so the page
 * renders unauthenticated and the API is unreachable. That makes the
 * server-rendered authenticated workspace — and therefore the verify / goal /
 * baseline steps of the wizard — unreachable from here.
 *
 * What IS genuinely verifiable in a real browser is asserted below: the
 * add-website hand-off, the copy discipline of Task P0.24 and the canonical
 * agent prompt of Task P0.23. The remaining Journey B steps are driven against
 * the same components in src/components/web-tracking/journey-b.test.tsx.
 */

const DOMAIN = "cardealertracker.app";
const TOKEN = "acwa1_e2e_token";

test.describe("Journey B — website install", () => {
  test("saves a website without ever calling it connected", async ({ page }) => {
    await page.route("**/api/apps", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "web-app-id",
            name: "Car Dealer Tracker",
            platform: "Web",
            bundleId: DOMAIN,
            property: {
              id: "prop-1",
              domain: DOMAIN,
              trackingToken: TOKEN,
              created: true,
            },
          },
        }),
      });
    });

    await page.goto("/");

    // --- 1. Add domain -----------------------------------------------------
    await page.getByLabel("Add app").click();
    await page.getByRole("tab", { name: "Web SaaS" }).click();
    await page.getByPlaceholder(/site URL or domain/i).fill(`https://${DOMAIN}`);
    await page.getByRole("button", { name: /Add Web SaaS/i }).click();

    // --- 2. `Website saved`, never `connected` -----------------------------
    await expect(page.getByText("Website saved").first()).toBeVisible();
    await expect(page.getByText(/Web SaaS connected/i)).toHaveCount(0);
    await expect(page.getByText(/Website connected/i)).toHaveCount(0);
    await expect(page.getByText("Tracking installed")).toHaveCount(0);
    await expect(
      page.getByText(/AppClimb accepts a real browser event from this domain/i),
    ).toBeVisible();

    // --- 3. The canonical AI-agent prompt is the default hand-off ----------
    await expect(
      page.getByRole("tab", { name: /AI Agent Prompt/i }),
    ).toHaveAttribute("aria-selected", "true");
    const promptText =
      (await page
        .locator("pre", {
          hasText: "Add AppClimb first-party web analytics to",
        })
        .first()
        .textContent()) ?? "";
    expect(promptText).toContain(DOMAIN);
    expect(promptText).toContain(`data-token="${TOKEN}"`);
    expect(promptText).toContain("after it accepts a real browser event");
    // The first prompt is not overloaded with optional crawler forwarding.
    expect(promptText).not.toContain("APPCLIMB_TRACKING_TOKEN");

    await expect(
      page.getByRole("button", { name: /Copy AI agent prompt/i }),
    ).toBeVisible();

    // Setup is resumable, not finished.
    await expect(
      page.getByRole("button", { name: /Continue website setup/i }),
    ).toBeVisible();
  });

  test("the public demo never claims a real website is connected", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText(/Web SaaS connected/i)).toHaveCount(0);
    await expect(page.getByText("Tracking installed")).toHaveCount(0);
  });

  test("renders the public decision-system landing page", async ({ page }) => {
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
