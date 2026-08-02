import { expect, test } from "./runtime-test";

const ITUNES = "https://itunes.apple.com";

function searchPayload(apps: Array<Record<string, unknown>>) {
  return {
    resultCount: apps.length,
    results: apps,
  };
}

// Icon hosts must match site CSP (img-src includes *.mzstatic.com).
const calmApp = {
  trackId: 123456789,
  trackName: "Calm Focus",
  bundleId: "com.example.calm",
  sellerName: "Indie Labs",
  primaryGenreName: "Health & Fitness",
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/calm.png",
  trackViewUrl: "https://apps.apple.com/app/id123456789",
  description:
    "Meditation timer for deep focus and mindfulness. Meditation guides help focus daily.",
  userRatingCount: 1200,
  averageUserRating: 4.7,
};

const competitor = {
  trackId: 111,
  trackName: "Sleep Stories",
  sellerName: "Other Co",
  primaryGenreName: "Lifestyle",
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/sleep.png",
  trackViewUrl: "https://apps.apple.com/app/id111",
  userRatingCount: 500,
  averageUserRating: 4.2,
};

const secondApp = {
  trackId: 987654321,
  trackName: "Invoice Scanner Pro",
  bundleId: "com.example.invoice",
  sellerName: "Biz Tools",
  primaryGenreName: "Business",
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/invoice.png",
  trackViewUrl: "https://apps.apple.com/app/id987654321",
  description: "Scan invoices quickly for freelancers.",
  userRatingCount: 80,
  averageUserRating: 4.1,
};

// 1×1 PNG so icon <img> tags do not console.error on 404.
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function mockItunes(page: import("@playwright/test").Page) {
  await page.route("https://is1-ssl.mzstatic.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: PIXEL_PNG,
    });
  });

  await page.route(`${ITUNES}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/lookup")) {
      const id = url.searchParams.get("id");
      if (id === "123456789") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(searchPayload([calmApp])),
        });
        return;
      }
      if (id === "987654321") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(searchPayload([secondApp])),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(searchPayload([])),
      });
      return;
    }

    if (path.endsWith("/search")) {
      const term = (url.searchParams.get("term") ?? "").toLocaleLowerCase();
      const limit = Number(url.searchParams.get("limit") ?? "8");

      if (limit <= 10 && (term.includes("calm") || term.includes("123456789"))) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(searchPayload([calmApp])),
        });
        return;
      }

      if (limit <= 10 && term.includes("invoice")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(searchPayload([secondApp])),
        });
        return;
      }

      // Keyword rank search — put Calm Focus at #2 for meditation-like terms.
      if (term.includes("fail-refresh")) {
        await route.fulfill({ status: 429, body: "rate limited" });
        return;
      }

      const ranked = [
        competitor,
        calmApp,
        {
          trackId: 222,
          trackName: "Focus Timer",
          sellerName: "Studio",
          primaryGenreName: "Health & Fitness",
          artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/focus.png",
          trackViewUrl: "https://apps.apple.com/app/id222",
          userRatingCount: 90,
          averageUserRating: 4.0,
        },
      ];

      // Second app should not appear in Calm's keyword results for isolation checks.
      if (term.includes("invoice")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            searchPayload([
              secondApp,
              {
                trackId: 333,
                trackName: "Receipt Keeper",
                sellerName: "Other",
                primaryGenreName: "Business",
                userRatingCount: 40,
                averageUserRating: 3.9,
              },
            ]),
          ),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(searchPayload(ranked)),
      });
      return;
    }

    await route.fallback();
  });
}

test("keyword explorer works without adding an app", async ({ page }) => {
  await mockItunes(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Find keywords worth ranking for/,
    }),
  ).toBeVisible();
  await expect(page.getByPlaceholder(/meditation/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Keyword Explorer/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add App/i }).first()).toBeVisible();

  await page.getByPlaceholder(/meditation/).fill("meditation");
  await page.getByRole("button", { name: "Analyze" }).click();
  await expect(page.getByText("meditation").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Estimated/i).first()).toBeVisible();
});

test("add app by search, accept suggestions, persist after reload", async ({
  page,
}) => {
  await mockItunes(page);
  await page.goto("/");

  await page.getByRole("button", { name: /Add App/i }).first().click();
  await expect(page.getByRole("heading", { name: "Add App" })).toBeVisible();
  await page.getByLabel("Search for an app").fill("Calm Focus");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("button", { name: /Add Calm Focus/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: /Add Calm Focus/i }).click();

  await expect(
    page.getByRole("heading", { name: /Keyword suggestions/i }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Add selected/i }).click();

  await expect(page.getByRole("heading", { name: "Calm Focus" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/Popularity · Est\./i).first()).toBeVisible();
  await expect(page.locator(".tracker-position").first()).toHaveText(/#\d+|>200/);

  // Reload — data must survive in localStorage.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Calm Focus" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator(".tracker-table tbody tr").first()).toBeVisible();
});

test("second app stays isolated; Apple errors preserve prior metrics", async ({
  page,
}) => {
  await mockItunes(page);
  await page.goto("/");

  // Add first app
  await page.getByRole("button", { name: /Add App/i }).first().click();
  await page.getByLabel("Search for an app").fill("Calm Focus");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: /Add Calm Focus/i }).click();
  await page.getByRole("button", { name: /Add selected/i }).click();
  await expect(page.getByRole("heading", { name: "Calm Focus" })).toBeVisible({
    timeout: 20_000,
  });
  const calmKeywordCount = await page.locator(".tracker-table tbody tr").count();
  expect(calmKeywordCount).toBeGreaterThan(0);

  // Add second app
  await page.getByRole("button", { name: /Add App/i }).first().click();
  await page.getByLabel("Search for an app").fill("Invoice Scanner");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: /Add Invoice Scanner Pro/i }).click();
  await page.getByRole("button", { name: /Add selected/i }).click();
  await expect(
    page.getByRole("heading", { name: "Invoice Scanner Pro" }),
  ).toBeVisible({ timeout: 20_000 });

  // Switch back to Calm — keyword set should still be there.
  await page.getByRole("button", { name: /Calm Focus/i }).first().click();
  await expect(page.getByRole("heading", { name: "Calm Focus" })).toBeVisible();
  await expect(page.locator(".tracker-table tbody tr")).toHaveCount(calmKeywordCount);

  // Force a failing refresh and ensure the row is not wiped.
  const firstKeyword = await page
    .locator(".tracker-table tbody tr")
    .first()
    .locator(".keyword-name")
    .innerText();
  const positionBefore = await page
    .locator(".tracker-table tbody tr")
    .first()
    .locator(".tracker-position")
    .innerText();

  await page.route(`${ITUNES}/search?**`, async (route) => {
    await route.fulfill({ status: 429, body: "rate limited" });
  });

  await page
    .locator(".tracker-table tbody tr")
    .first()
    .getByRole("button", { name: new RegExp(`Refresh ${firstKeyword}`, "i") })
    .click();

  await expect(page.getByRole("alert").first()).toContainText(/rate-limiting|preserved/i, {
    timeout: 10_000,
  });
  await expect(
    page.locator(".tracker-table tbody tr").first().locator(".keyword-name"),
  ).toHaveText(firstKeyword);
  // Position text should still show a prior value (not blank wipe).
  await expect(
    page.locator(".tracker-table tbody tr").first().locator(".tracker-position"),
  ).toHaveText(positionBefore);
});

test("mobile layout keeps tracker actions reachable", async ({ page }) => {
  await mockItunes(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: /Open navigation|Menu/i })).toBeVisible();
  await page.getByRole("button", { name: /Open navigation|Menu/i }).click();
  await expect(page.getByRole("button", { name: /Add App/i }).first()).toBeVisible();
  await page.getByRole("button", { name: /Add App/i }).first().click();
  await expect(page.getByRole("heading", { name: "Add App" })).toBeVisible();

  const dialogBox = page.getByRole("dialog");
  const box = await dialogBox.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(390 + 1);
  }
});
