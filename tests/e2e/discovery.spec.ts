import { expect, test } from "./runtime-test";

const ITUNES = "https://itunes.apple.com";

const apps = Array.from({ length: 12 }, (_, index) => ({
  trackId: 500 + index,
  trackName: index < 3 ? `Habit Tracker ${index + 1}` : `Planner ${index + 1}`,
  sellerName: `Studio ${index + 1}`,
  primaryGenreName: "Productivity",
  artworkUrl100: "",
  trackViewUrl: `https://apps.apple.com/app/id${500 + index}`,
  userRatingCount: index === 6 ? 40 : 12_000 + index * 1_000,
  averageUserRating: 4.6,
}));

const weeks = Array.from({ length: 12 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 6, 5 + index * 7));
  return { week: date.toISOString().slice(0, 10), popularity: 52 + Math.round(index / 3) };
});

async function mockApple(page: import("@playwright/test").Page) {
  await page.route(`${ITUNES}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ resultCount: apps.length, results: apps }),
    });
  });
  await page.route("**/api/terms/trending?*", async (route) => {
    const genre = new URL(route.request().url()).searchParams.get("genre");
    const term = (name: string, popularity: number, delta: number | null) => ({
      term: name,
      genre: genre ?? "PRODUCTIVITY_UTILITIES",
      popularity,
      delta,
      rankInGenre: 100 - popularity,
      rankDelta: delta,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        week: "2026-09-20",
        compareWeek: "2026-08-23",
        rising: [term("habit tracker", 56, 4), term("focus timer", 50, 3)],
        newcomers: [term("ai planner", 49, null)],
        top: [term("calendar", 70, 1)],
      }),
    });
  });
  await page.route("**/api/terms/suggest?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        suggestions: [
          { term: "habit tracker", genre: "PRODUCTIVITY_UTILITIES", popularity: 56 },
          { term: "habit app", genre: "PRODUCTIVITY_UTILITIES", popularity: 47 },
        ],
      }),
    });
  });
  await page.route("**/api/terms/related?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        related: [
          { term: "daily habit tracker", genre: "PRODUCTIVITY_UTILITIES", popularity: 49, shared: 2 },
          { term: "habit app", genre: "PRODUCTIVITY_UTILITIES", popularity: 47, shared: 1 },
        ],
      }),
    });
  });
  await page.route("**/api/popularity", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      items?: Array<{ term: string }>;
    };
    const results = (body.items ?? []).map(({ term }) =>
      term.toLocaleLowerCase() === "habit tracker"
        ? {
            term,
            found: true,
            genre: "PRODUCTIVITY_UTILITIES",
            searchPopularity1to100: 56,
            rankInGenre: 443,
            weekStart: "2026-09-20",
            history: weeks,
          }
        : { term, found: false, genre: "PRODUCTIVITY_UTILITIES", ceiling: 47, weekStart: "2026-09-20" },
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: true, week: "2026-09-20", results }),
    });
  });
}

test("trending searches come from Apple's list and analyze on click", async ({ page }) => {
  await mockApple(page);
  await page.goto("/");

  const panel = page.getByRole("region", { name: /What people search/i });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/week of Sep 20/)).toBeVisible();
  await expect(panel.getByRole("button", { name: /habit tracker/ })).toBeVisible();
  await expect(panel.getByText("+4")).toBeVisible();

  await panel.getByRole("tab", { name: /New this month/ }).click();
  await expect(panel.getByRole("button", { name: /ai planner/ })).toBeVisible();

  await panel.getByRole("tab", { name: /Rising/ }).click();
  await panel.getByRole("button", { name: /habit tracker/ }).click();
  await expect(page.locator(".ex-table tbody tr")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "habit tracker", exact: true })).toBeVisible();
});

test("autocomplete lists Apple searches with popularity and supports the keyboard", async ({
  page,
}) => {
  await mockApple(page);
  await page.goto("/");

  const input = page.getByRole("combobox", { name: "Search keywords" });
  await input.fill("habit");
  const list = page.locator(".ex-suggestions");
  await expect(list).toBeVisible();
  await expect(list.getByRole("option")).toHaveCount(2);
  await expect(list.getByRole("option").first()).toContainText("56");

  await input.press("ArrowDown");
  await expect(list.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(page.locator(".ex-table tbody tr")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".ex-td-keyword strong").first()).toHaveText("habit tracker");
  await expect(input).toHaveValue("");
  await expect(list).toHaveCount(0);
});

test("the detail panel explains the verdict with evidence, history, and related searches", async ({
  page,
}) => {
  await mockApple(page);
  await page.goto("/?kw=habit%20tracker&country=US");

  const detail = page.locator(".kd");
  await expect(detail.getByRole("heading", { name: "habit tracker", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(detail.locator(".kd-verdict .opp-pill")).toBeVisible();
  await expect(detail.getByText(/#443 of the 500 most-searched terms in Productivity/)).toBeVisible();
  await expect(detail.getByText(/Weakest: #7 with 40 ratings/)).toBeVisible();
  await expect(detail.getByText(/3\/10 have the keyword in their name/)).toBeVisible();
  await expect(detail.getByText(/last 12 weeks · Apple Ads Insights/)).toBeVisible();
  await expect(detail.getByRole("img", { name: /popularity: 12 points/ })).toBeVisible();

  // A related Apple search is one click from its own analysis.
  await detail.getByRole("button", { name: /daily habit tracker/ }).click();
  await expect(page.locator(".ex-table tbody tr")).toHaveCount(2, { timeout: 15_000 });
  const relatedRow = page.locator(".ex-table tbody tr").filter({ hasText: "daily habit tracker" });
  await expect(relatedRow.locator(".ex-td-pop")).toContainText("≤47");
  await expect(relatedRow.locator(".ex-td-pop")).toContainText("Long tail");
});
