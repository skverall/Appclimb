import { expect, test } from "./runtime-test";

/** A tracked app with two freshly checked keywords (no network needed). */
function seedTracker() {
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  const metrics = (popularity: number, position: number | null) => ({
    popularity,
    popularitySource: "official",
    difficulty: 50,
    results: 200,
    saturated: false,
    topApps: [],
    position,
    sampledAt: now,
  });
  const keyword = (name: string, popularity: number, position: number | null) => ({
    appStoreId: "1",
    country: "US",
    keyword: name,
    normalizedKeyword: name,
    note: "",
    tags: [],
    createdAt: day,
    lastCheckedAt: now,
    currentMetrics: metrics(popularity, position),
  });
  return {
    version: 1,
    activeAppKey: "1:US",
    apps: [
      {
        appStoreId: "1",
        name: "Columns Test App",
        bundleId: "com.example.columns",
        developer: "Example",
        genre: "Productivity",
        iconUrl: "",
        storeUrl: "",
        country: "US",
        addedAt: day,
      },
    ],
    keywords: {
      "1:US:habit tracker with a very long keyword name": keyword(
        "habit tracker with a very long keyword name",
        61,
        12,
      ),
      "1:US:streak": keyword("streak", 44, null),
    },
    snapshots: {},
  };
}

test("keyword table columns resize like a spreadsheet and remember it", async ({ page }) => {
  const store = seedTracker();
  await page.addInitScript((value) => {
    if (!window.sessionStorage.getItem("seeded")) {
      window.sessionStorage.setItem("seeded", "1");
      window.localStorage.setItem("appclimb:tracker:v1", JSON.stringify(value));
    }
  }, store);
  await page.goto("/");
  await page.getByRole("button", { name: /Tracked Apps/i }).click();
  const header = page.locator(".tracker-table thead th").first();
  await expect(header).toBeVisible({ timeout: 15_000 });
  const width = () => header.evaluate((element) => Math.round(element.getBoundingClientRect().width));
  const before = await width();

  // Drag the Keyword column's right edge 100px wider.
  const handle = page.getByRole("separator", { name: "Resize Keyword column" });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(width).toBeGreaterThan(before + 80);
  const dragged = await width();

  // Keyboard works too, and a reload keeps the layout.
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(width).toBe(dragged - 16);
  await page.reload();
  await expect(header).toBeVisible({ timeout: 15_000 });
  await expect.poll(width).toBe(dragged - 16);

  // The ⋯ menu offers a reset once widths were changed.
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: /Reset column widths/i }).click();
  await expect.poll(width).toBe(before);
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menuitem", { name: /Reset column widths/i })).toHaveCount(0);
});
