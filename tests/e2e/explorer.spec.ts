import { readFileSync } from "node:fs";

import { expect, test } from "./runtime-test";

const ITUNES = "https://itunes.apple.com";

function searchPayload(apps: Array<Record<string, unknown>>) {
  return {
    resultCount: apps.length,
    results: apps,
  };
}

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

const focusTimer = {
  trackId: 222,
  trackName: "Focus Timer",
  sellerName: "Studio",
  primaryGenreName: "Health & Fitness",
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/focus.png",
  trackViewUrl: "https://apps.apple.com/app/id222",
  userRatingCount: 90,
  averageUserRating: 4.0,
};

// Saturated result set (200 entries, zero ratings): high competition, weak
// incumbents → estimated popularity ≥ 55 with difficulty ≤ 40 → "golden".
const saturatedApps = Array.from({ length: 200 }, (_, index) => ({
  trackId: 1000 + index,
  trackName: `Utility App ${index + 1}`,
  sellerName: `Studio ${index + 1}`,
  primaryGenreName: "Utilities",
  artworkUrl100: "",
  trackViewUrl: "",
  userRatingCount: 0,
  averageUserRating: 0,
}));

async function mockExplorer(page: import("@playwright/test").Page) {
  await page.route(`${ITUNES}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith("/search")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }
    const term = (url.searchParams.get("term") ?? "").toLocaleLowerCase();
    const limit = Number(url.searchParams.get("limit") ?? "8");

    // Suggestion searches (limit ≤ 10) return a single plausible app.
    if (limit <= 10) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(searchPayload([calmApp])),
      });
      return;
    }

    // One deliberately failing term exercises the partial-failure banner.
    if (term.includes("fail-bulk")) {
      await route.fulfill({ status: 429, body: "rate limited" });
      return;
    }

    // Rank searches: "yoga" is saturated and weak → golden. Everything else
    // returns a small weak list → solid but not golden.
    const body =
      term.includes("yoga") && !term.includes("meditation")
        ? searchPayload(saturatedApps)
        : searchPayload([competitor, calmApp, focusTimer]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

const ROW = ".keyword-table tbody tr";

test("bulk analyze surfaces golden keywords and sortable scores", async ({
  page,
}) => {
  await mockExplorer(page);
  await page.goto("/");

  await page.getByRole("button", { name: /Analyze list/i }).click();
  await expect(page.getByRole("dialog", { name: "Analyze a list" })).toBeVisible();
  await page.getByLabel("Keywords to analyze").fill("meditation\nyoga\nzen");
  await page.getByRole("button", { name: /Analyze 3 keywords/i }).click();

  // The batch runs with bounded concurrency and reports a done banner.
  await expect(page.getByText(/all 3 keywords analyzed/i)).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator(ROW)).toHaveCount(3);

  // Only "yoga" (saturated, weak incumbents) earns the golden badge.
  const yogaRow = page.locator(ROW).filter({
    has: page.getByText("yoga", { exact: true }),
  });
  await expect(yogaRow.locator(".keyword-golden-badge")).toHaveText("Golden");
  await expect(page.locator(ROW).filter({ has: page.locator(".keyword-golden-badge") })).toHaveCount(1);

  // The Golden filter narrows the table and counts match.
  await page.getByRole("tab", { name: /Golden/ }).click();
  await expect(page.locator(ROW)).toHaveCount(1);
  await expect(page.locator(".keyword-name").first()).toHaveText("yoga");

  // Back to all, then sort by popularity (descending): yoga is first.
  await page.getByRole("tab", { name: /All/ }).click();
  await expect(page.locator(ROW)).toHaveCount(3);
  await page.getByRole("button", { name: "Popularity", exact: true }).click();
  await expect(page.locator(".keyword-name").first()).toHaveText("yoga");
});

test("explorer exports CSV, backs up, and restores history", async ({
  page,
}) => {
  await mockExplorer(page);
  await page.goto("/");

  await page.getByPlaceholder(/meditation/).fill("meditation");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.locator(ROW)).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".metric-bar--popularity")).toBeVisible({
    timeout: 15_000,
  });

  // CSV export: header plus the analyzed row.
  const csvPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export CSV/i }).click();
  const csvDownload = await csvPromise;
  expect(csvDownload.suggestedFilename()).toBe("appclimb-keywords-us.csv");
  const csvText = readFileSync(await csvDownload.path(), "utf8");
  expect(csvText).toContain(
    "keyword,store,popularity,popularity_source,difficulty_estimated,results,saturated,trend_delta,last_checked_at",
  );
  expect(csvText).toContain("meditation,US,");

  // JSON backup: versioned, with the record and the country list.
  const backupPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  const backupDownload = await backupPromise;
  expect(backupDownload.suggestedFilename()).toMatch(
    /^appclimb-keyword-history-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const backup = JSON.parse(
    readFileSync(await backupDownload.path(), "utf8"),
  ) as { version: number; data: Record<string, string> };
  expect(backup.version).toBe(1);
  expect(Object.keys(backup.data)).toContain("appclimb:kw:v1:list:US");
  expect(
    Object.keys(backup.data).some((key) => key.includes(":US:meditation")),
  ).toBe(true);

  // Wipe local storage, then restore from the downloaded backup file.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByText(/No keywords yet/i)).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(await backupDownload.path());
  await expect(page.getByText(/Restored 1 keyword record/i)).toBeVisible();
  await expect(page.locator(ROW)).toHaveCount(1);
  await expect(page.locator(".keyword-name").first()).toHaveText("meditation");
});

test("explorer removal offers undo", async ({ page }) => {
  await mockExplorer(page);
  await page.goto("/");

  await page.getByPlaceholder(/meditation/).fill("meditation");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.locator(ROW)).toHaveCount(1, { timeout: 15_000 });

  await page.getByRole("button", { name: /Remove meditation/i }).click();
  await expect(page.getByText(/Removed “meditation”/i)).toBeVisible();
  await expect(page.locator(ROW)).toHaveCount(0);

  // Undo restores the row and its metrics.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(ROW)).toHaveCount(1);
  await expect(page.locator(".keyword-name").first()).toHaveText("meditation");
  await expect(page.locator(".metric-bar--popularity").first()).toBeVisible();
});

test("failed iTunes lookups refund the guest daily check", async ({ page }) => {
  // Accounts are live with a signed-out free user: this activates the guest
  // daily quota (8 checks) so the counter is actually enforced and the 8/day
  // limit wording appears.
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        user: null,
        plan: "free",
        subscription: null,
      }),
    });
  });
  // Apple is temporarily down: every iTunes lookup fails (500 is tolerated by
  // the console-error filter), and official popularity is unconfigured.
  await page.route(`${ITUNES}/**`, async (route) => {
    await route.fulfill({ status: 500, body: "Service Unavailable" });
  });
  await page.route("**/api/popularity", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: false, results: [] }),
    });
  });

  const readCount = () =>
    page.evaluate(() => {
      const raw = window.localStorage.getItem("appclimb:explorer:day");
      const day = new Date().toISOString().slice(0, 10);
      const parsed = raw ? (JSON.parse(raw) as { day: string; count: number }) : null;
      return { day, count: parsed?.day === day ? parsed.count : 0 };
    });

  await page.goto("/");
  await expect(page.getByPlaceholder(/meditation/)).toBeVisible();

  // First attempt fails — the error surfaces and no row lingers.
  await page.getByPlaceholder(/meditation/).fill("meditation");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.locator(".keyword-error")).toContainText(
    /could not analyze/i,
    { timeout: 15_000 },
  );
  await expect(page.locator(ROW)).toHaveCount(0);

  // The failed attempt must not consume one of the 8 daily checks.
  expect(await readCount()).toMatchObject({ count: 0 });

  // Apple recovers: a real check now consumes exactly one unit.
  await mockExplorer(page);
  await page.getByPlaceholder(/meditation/).fill("yoga");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.locator(ROW)).toHaveCount(1, { timeout: 15_000 });
  expect(await readCount()).toMatchObject({ count: 1 });

  // A refresh of the same keyword (already tracked) is not a new check.
  await page.getByRole("button", { name: /Refresh all/i }).click();
  await expect(page.locator(ROW)).toHaveCount(1, { timeout: 15_000 });
  expect(await readCount()).toMatchObject({ count: 1 });
});

test("share links analyze the keyword on load", async ({ page }) => {
  await mockExplorer(page);
  await page.goto("/?kw=yoga&country=US");

  await expect(page.locator(ROW)).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".keyword-name").first()).toHaveText("yoga");
  await expect(page.locator(".keyword-golden-badge").first()).toHaveText("Golden");
});

test("keyword suggestions close on Escape and on outside click", async ({
  page,
}) => {
  await mockExplorer(page);
  await page.goto("/");

  const input = page.getByLabel("Search keywords");
  await input.fill("med");
  const dropdown = page.locator(".keyword-suggestions");
  await expect(dropdown).toBeVisible({ timeout: 10_000 });
  await expect(dropdown.getByRole("option").first()).toBeVisible();

  // Escape closes the dropdown (the query itself is preserved).
  await input.press("Escape");
  await expect(dropdown).toHaveCount(0);
  await expect(input).toHaveValue("med");

  // It reopens while typing, then a click outside the form dismisses it.
  await input.press("m");
  await expect(dropdown).toBeVisible({ timeout: 10_000 });
  await page
    .getByRole("heading", { level: 1, name: /Popularity from Apple/ })
    .click();
  await expect(dropdown).toHaveCount(0);

  // The input announces the listbox relationship while suggestions are open.
  await input.fill("med");
  await expect(dropdown).toBeVisible({ timeout: 10_000 });
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await expect(input).toHaveAttribute("aria-controls", "keyword-suggestions");
  await input.press("Escape");
});

test("limit banner clears when the day rolls over", async ({ page }) => {
  // Live free account so the 8/day guest cap is enforced.
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        user: null,
        plan: "free",
        subscription: null,
      }),
    });
  });
  await mockExplorer(page);

  const day = new Date().toISOString().slice(0, 10);
  await page.goto("/");
  await page.evaluate((stamp) => {
    window.localStorage.setItem(
      "appclimb:explorer:day",
      JSON.stringify({ day: stamp, count: 8 }),
    );
  }, day);
  await page.reload();

  const banner = page.getByText(/You've used your 8 free keyword checks/);
  await expect(banner).toBeVisible();

  // A further attempt stays blocked while the cap is genuinely exhausted.
  await page.getByPlaceholder(/meditation/).fill("yoga");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.locator(ROW)).toHaveCount(0);

  // Midnight passes while the tab stays open: the counter now belongs to
  // yesterday, so the stale banner must clear on the next interaction and a
  // fresh day of checks must be available.
  await page.evaluate(() => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    window.localStorage.setItem(
      "appclimb:explorer:day",
      JSON.stringify({ day: yesterday, count: 8 }),
    );
  });
  await page.getByPlaceholder(/meditation/).fill("yoga");

  await expect(banner).toHaveCount(0);

  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.locator(ROW)).toHaveCount(1, { timeout: 15_000 });
  // The fresh day's counter is now at 1: the remaining-checks indicator
  // returns and shows the honest budget.
  await expect(page.getByText(/7 of 8 free checks left today/i)).toBeVisible();
});

test("bulk analyze reports partial failures honestly", async ({ page }) => {
  await mockExplorer(page);
  await page.goto("/");

  await page.getByRole("button", { name: /Analyze list/i }).click();
  await page.getByLabel("Keywords to analyze").fill("meditation\nfail-bulk");
  await page.getByRole("button", { name: /Analyze 2 keywords/i }).click();

  // One succeeds, one is rate-limited: the banner names the failure instead
  // of pretending everything worked, and no failed row lingers.
  await expect(
    page.getByText(/Done — 1 of 2 couldn’t be analyzed/i),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(ROW)).toHaveCount(1);
  await expect(page.locator(ROW).filter({ hasText: "fail-bulk" })).toHaveCount(0);

  // The successful keyword is present with its metrics.
  await expect(
    page.locator(ROW).filter({ hasText: "meditation" }),
  ).toHaveCount(1);
});
