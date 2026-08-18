import { expect, test } from "./runtime-test";

const ITUNES = "https://itunes.apple.com";
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function mockTrackerItunes(page: import("@playwright/test").Page) {
  await page.route("https://is1-ssl.mzstatic.com/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG });
  });
  await page.route(`${ITUNES}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/lookup")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          resultCount: 1,
          results: [
            {
              trackId: 6755675367,
              trackName: "Car Dealer Tracker: Profit",
              bundleId: "com.ezcar24.business",
              sellerName: "Shokhabbos Makhmudov",
              primaryGenreName: "Business",
              artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/dealer.png",
              trackViewUrl: "https://apps.apple.com/app/id6755675367",
              description: "Manage inventory, sales, expenses, and profit.",
              userRatingCount: 40,
              averageUserRating: 4.3,
            },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCount: 3,
        results: [
          { trackId: 1, trackName: "Dealer App One", sellerName: "Co", primaryGenreName: "Business", userRatingCount: 100, averageUserRating: 4.0 },
          { trackId: 2, trackName: "Dealer App Two", sellerName: "Co2", primaryGenreName: "Business", userRatingCount: 200, averageUserRating: 4.2 },
          { trackId: 3, trackName: "Dealer App Three", sellerName: "Co3", primaryGenreName: "Business", userRatingCount: 300, averageUserRating: 4.5 },
        ],
      }),
    });
  });
}

test("tracker design tokens hold at 375px and 1024px", async ({ page }) => {
  await mockTrackerItunes(page);

  for (const [width, height] of [
    [375, 812],
    [1024, 768],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: /Try a sample app/i }).click();
    await expect(
      page.getByRole("heading", { name: /Car Dealer Tracker: Profit/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".tracker-table tbody tr")).toHaveCount(7, {
      timeout: 30_000,
    });

    // Numeric cells use tabular figures (no jitter while rank numbers change).
    const positionStyle = await page
      .locator(".tracker-position")
      .first()
      .evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    expect(positionStyle).toContain("tabular-nums");

    // The sticky keyword column is separated from the scrolled content.
    const stickyShadow = await page
      .locator(".tracker-col-sticky")
      .first()
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(stickyShadow).not.toBe("none");

    // Status filter chips fit the viewport (wrap instead of overflowing).
    const chipsBox = await page.locator(".tracker-status-filters").boundingBox();
    if (chipsBox) {
      expect(chipsBox.x).toBeGreaterThanOrEqual(0);
      expect(chipsBox.x + chipsBox.width).toBeLessThanOrEqual(width + 1);
    }

    // The page itself never scrolls horizontally.
    const overflow = await page.evaluate(
      () =>
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - document.documentElement.clientWidth,
    );
    expect(overflow, `overflow at ${width}px: ${overflow}px`).toBeLessThanOrEqual(0);
  }
});
