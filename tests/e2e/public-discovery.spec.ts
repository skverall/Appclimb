import { expect, test } from "./runtime-test";

test("keyword research landing page is indexable and mobile-safe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app-store-keywords");

  await expect(page).toHaveTitle(/App Store Keyword Research/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Pick keywords worth ranking for/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("✅ Estimates labeled honestly"),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://appclimb.app/app-store-keywords",
  );

  const pageOverflow = await page.evaluate(
    () =>
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - document.documentElement.clientWidth,
  );
  expect(pageOverflow).toBeLessThanOrEqual(0);
});

test("home page renders the keyword explorer without an account", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Find keywords worth ranking for/,
    }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder(/meditation/),
  ).toBeVisible();
  await expect(
    page.getByText(/Estimates, never invented volumes/i),
  ).toBeVisible();
});

test("articles expose canonical metadata and parseable JSON-LD", async ({
  page,
}) => {
  await page.goto("/blog/app-store-conversion-rate");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /What Is App Store Conversion Rate/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /total downloads and pre-orders divided by unique device impressions/i,
    ),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://appclimb.app/blog/app-store-conversion-rate",
  );

  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  expect(jsonLd.length).toBeGreaterThanOrEqual(3);
  for (const value of jsonLd) {
    expect(() => JSON.parse(value)).not.toThrow();
  }
  expect(
    jsonLd.some((value) => JSON.parse(value)["@type"] === "BlogPosting"),
  ).toBe(true);
});

test("crawl and agent discovery endpoints are public and coherent", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain(
    "Sitemap: https://appclimb.app/sitemap.xml",
  );

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const sitemapBody = await sitemap.text();
  expect(sitemapBody).toContain(
    "<loc>https://appclimb.app/app-store-keywords</loc>",
  );
  expect(sitemapBody).toContain(
    "<loc>https://appclimb.app/guides/keyword-research</loc>",
  );
  expect(sitemapBody).not.toContain("/login");
  expect(sitemapBody).not.toContain("/checkout");

  for (const endpoint of [
    "/manifest.webmanifest",
    "/feed.xml",
    "/llms.txt",
    "/pricing.md",
    "/favicon.ico",
    "/icon.svg",
  ]) {
    const response = await request.get(endpoint);
    expect(response.ok(), `${endpoint} should return 200`).toBe(true);
  }
});

test("every canonical sitemap page returns a successful document", async ({
  request,
}) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => new URL(match[1]).pathname,
  );

  expect(paths.length).toBeGreaterThanOrEqual(10);
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.ok(), `${path} should return 200`).toBe(true);
    expect(response.headers()["content-type"]).toContain("text/html");
  }
});
