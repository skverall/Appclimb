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

// Mirrors the quick-start preset (tracker STARTER_APP_ID).
const carDealerApp = {
  trackId: 6755675367,
  trackName: "Car Dealer Tracker: Profit",
  bundleId: "com.ezcar24.business",
  sellerName: "Shokhabbos Makhmudov",
  primaryGenreName: "Business",
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/dealer.png",
  trackViewUrl: "https://apps.apple.com/app/id6755675367",
  description:
    "Car Dealer Tracker helps auto dealers manage vehicle inventory, track car sales, expenses, and profit in one place.",
  userRatingCount: 40,
  averageUserRating: 4.3,
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
      if (id === "6755675367") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(searchPayload([carDealerApp])),
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
        carDealerApp,
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
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByText("meditation").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Estimated/i).first()).toBeVisible();
});

test("onboarding walks a first-time user from CTA to tracked keywords", async ({
  page,
}) => {
  await mockItunes(page);
  await page.goto("/");

  // Before any app exists, the onboarding section explains the flow.
  await expect(
    page.getByRole("heading", {
      name: /Track your app’s keywords in three steps/i,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Add your first app/i }).click();
  await expect(page.getByRole("heading", { name: "Add App" })).toBeVisible();

  // Add the app by pasting an App Store URL (the /lookup path).
  await page
    .getByLabel("Search for an app")
    .fill("https://apps.apple.com/us/app/calm-focus/id123456789");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("button", { name: /Add Calm Focus/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: /Add Calm Focus/i }).click();

  // Dismiss the suggestions modal and land on the empty keyword state.
  await expect(
    page.getByRole("heading", { name: /Keyword suggestions/i }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Close suggestions/i }).click();
  await expect(page.getByText(/No keywords for this app yet/i)).toBeVisible();

  // Re-open suggestions from the empty state and accept them.
  await page
    .locator(".keyword-empty")
    .getByRole("button", { name: "Get Suggestions" })
    .click();
  await expect(
    page.getByRole("heading", { name: /Keyword suggestions/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Add selected/i }).click();
  await expect(page.locator(".tracker-table tbody tr").first()).toBeVisible({
    timeout: 20_000,
  });
  const suggestedCount = await page.locator(".tracker-table tbody tr").count();
  expect(suggestedCount).toBeGreaterThan(0);

  // Add keywords manually on top of the suggestions.
  await page.getByRole("button", { name: "Add Keywords" }).click();
  await expect(page.getByRole("heading", { name: "Add Keywords" })).toBeVisible();
  await page.getByLabel("Keywords to add").fill("meditation\nyoga");
  await page.getByRole("button", { name: /Add 2 keywords/i }).click();
  await expect(page.locator(".tracker-table tbody tr")).toHaveCount(
    suggestedCount + 2,
    { timeout: 20_000 },
  );
});

test("quick start seeds the sample app and its keywords", async ({
  page,
}) => {
  await mockItunes(page);
  await page.goto("/");

  // Onboarding CTA runs the one-click sample without any typing.
  await expect(
    page.getByRole("heading", {
      name: /Track your app’s keywords in three steps/i,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Try a sample app/i }).click();

  // The app lands in the tracker view and all starter keywords get checked.
  await expect(
    page.getByRole("heading", { name: /Car Dealer Tracker: Profit/i }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".tracker-table tbody tr")).toHaveCount(7, {
    timeout: 30_000,
  });

  // Right-side overview mirrors the Everank-style panel: best position
  // history, my rankings, and all ranked apps.
  await expect(
    page.getByRole("heading", { name: /Best Position History/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /My Rankings/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /All Ranked Apps/i }),
  ).toBeVisible();
  // The tracked app is excluded from competitors; mocked results put the
  // car dealer app at #3, so it should not appear in the list.
  await expect(
    page.locator(".tracker-overview-apps").getByText(/Car Dealer Tracker/i),
  ).toHaveCount(0);

  // My Rankings rows are clickable and open the keyword detail panel.
  await page
    .locator(".tracker-overview-list")
    .getByRole("button", { name: /car dealer tracker/i })
    .click();
  await expect(
    page.getByRole("heading", { name: "car dealer tracker", exact: true }),
  ).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /Close keyword detail/i }).click();
  await expect(
    page.getByRole("heading", { name: /My Rankings/i }),
  ).toBeVisible();

  // The Add App modal offers the same quick start and knows it was added.
  await page.getByRole("button", { name: /Add App/i }).first().click();
  await expect(page.getByRole("heading", { name: "Add App" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Already added/i }),
  ).toBeVisible();
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

  // Let the auto-analysis queue finish so captured state is stable. The
  // needsCheck queue starts asynchronously after the app switch, so first
  // wait for it to appear (if it runs at all), then for it to disappear.
  await page
    .waitForSelector(".tracker-queue-banner", { state: "visible", timeout: 5_000 })
    .catch(() => {});
  await expect(page.locator(".tracker-queue-banner")).toBeHidden({
    timeout: 30_000,
  });

  // Force a failing refresh and ensure the row is not wiped. The row may
  // move under the default opportunity sort (a failed keyword has no fresh
  // opportunity signal), so locate it by its exact keyword name.
  const firstKeyword = await page
    .locator(".tracker-table tbody tr")
    .first()
    .locator(".keyword-name")
    .innerText();
  const targetRow = page.locator(".tracker-table tbody tr").filter({
    has: page.getByText(firstKeyword, { exact: true }),
  });
  const positionBefore = await targetRow.locator(".tracker-position").innerText();

  await page.route(`${ITUNES}/search?**`, async (route) => {
    await route.fulfill({ status: 429, body: "rate limited" });
  });

  await targetRow
    .getByRole("button", { name: new RegExp(`Refresh ${firstKeyword}`, "i") })
    .click();

  await expect(page.getByRole("alert").first()).toContainText(/rate-limiting|preserved/i, {
    timeout: 10_000,
  });
  await expect(targetRow.locator(".keyword-name")).toHaveText(firstKeyword);
  // Position text should still show a prior value (not blank wipe).
  await expect(targetRow.locator(".tracker-position")).toHaveText(positionBefore);
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
