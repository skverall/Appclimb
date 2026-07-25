import type { Page } from "@playwright/test";

import { expect, test } from "./runtime-test";

async function expectNoPageLevelHorizontalOverflow(
  page: Page,
  screen: string,
) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const viewportWidth = document.documentElement.clientWidth;
          const pageWidth = Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          );
          return pageWidth - viewportWidth;
        }),
      {
        message: `${screen} should not create page-level horizontal scrolling at 390px.`,
      },
    )
    .toBeLessThanOrEqual(0);
}

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
  await expect(page).toHaveURL(/\?view=diagnose&insight=insight-store$/);
  await expect(
    page.getByRole("heading", { name: "Test screenshot promise" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Create local draft/ }).click();
  await expect(page).toHaveURL(/\?view=lab&insight=insight-store$/);
  await expect(
    page
      .getByRole("status")
      .getByText(/Session-only draft created from .* evidence/),
  ).toBeVisible();
  await expect(page.getByText("Product page conversion").first()).toBeVisible();
  await expect(page.getByText("Download volume").first()).toBeVisible();
  await expect(page.getByText("App Store Connect").first()).toBeVisible();

  await page.getByRole("button", { name: "Pulse" }).click();
  await page.getByRole("button", { name: "Lab" }).click();
  await expect(
    page
      .getByRole("status")
      .getByText(/Session-only draft created from .* evidence/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open" }).first().click();
  await expect(
    page.getByRole("dialog").getByText(
      "This is a read-only experiment record.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close experiment" }).click();

  await page.getByRole("button", { name: "Sources" }).click();
  await expect(page).toHaveURL(/\?view=sources$/);
  await expect(
    page.locator(".source-card [data-provider-mark]"),
  ).toHaveCount(5);
  await page.getByRole("button", { name: /RevenueCat/ }).first().click();
  await expect(page.getByRole("heading", { name: "RevenueCat" })).toBeVisible();
  await expect(
    page.locator(
      '.source-detail [data-provider-mark="revenuecat"]',
    ),
  ).toBeVisible();
  await expect(page.getByText("None in demo")).toBeVisible();
});

test("workspace links reload and browser history restores context", async ({
  page,
}) => {
  await page.goto("/?view=diagnose&insight=insight-activation");
  await expect(
    page.getByRole("heading", { name: "Fix first-session activation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Diagnose", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Fix first-session activation" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await expect(page).toHaveURL(/\?view=sources$/);
  await page.goBack();
  await expect(page).toHaveURL(
    /\?view=diagnose&insight=insight-activation$/,
  );
  await expect(
    page.getByRole("heading", { name: "Fix first-session activation" }),
  ).toBeVisible();
});

test("reduced motion keeps replay directly controllable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Play growth replay" }).click();
  await expect(page.getByText("Before first change")).toBeVisible();
});

test("public pricing exposes the early-access catalog and signup path", async ({
  page,
}) => {
  await page.goto("/pricing");
  await expect(
    page.getByRole("heading", {
      name: "Try the River Atlas concept with product status made clear.",
    }),
  ).toBeVisible();
  await expect(page.getByText("$12.99")).toBeVisible();
  await expect(page.getByText("$129", { exact: true })).toBeVisible();

  await page
    .getByRole("link", { name: "Start 14-day early access" })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Create an early-access workspace." }),
  ).toBeVisible();
});

test("checkout success cannot confirm an anonymous payment", async ({
  page,
}) => {
  await page.goto("/checkout/success");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(/payment received/i)).toHaveCount(0);

  const bindingResponse = await page.request.post(
    "/api/billing/checkout-binding",
    { data: { priceId: "pri_not_authorized" } },
  );
  expect(bindingResponse.status()).toBe(401);
});

test("refund policy exposes a working buyer-support path", async ({ page }) => {
  await page.goto("/refunds");
  await expect(
    page.getByRole("link", { name: "Paddle buyer support" }),
  ).toHaveAttribute("href", "https://paddle.net/contact");
});

test("mobile navigation is named and the page stays within 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const navigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  await expect(navigation).toBeVisible();
  await expectNoPageLevelHorizontalOverflow(page, "Pulse");

  for (const section of ["Pulse", "Diagnose", "Lab", "Sources"]) {
    await test.step(section, async () => {
      const navigationButton = navigation.getByRole("button", {
        name: section,
        exact: true,
      });
      await expect(navigationButton).toBeVisible();
      await navigationButton.click();
      await expect(navigationButton).toHaveAttribute("aria-current", "page");
      await expectNoPageLevelHorizontalOverflow(page, section);
    });
  }
});
