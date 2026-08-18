import { dismissExpectedConsoleErrors, expect, test } from "./runtime-test";

test("keyword research landing page is indexable and mobile-safe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app-store-keywords");

  await expect(page).toHaveTitle(/Official Apple Ads Popularity/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Popularity from Apple/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("✅ Official Apple Ads popularity"),
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
      name: /Popularity from Apple/,
    }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder(/meditation/),
  ).toBeVisible();
  await expect(
    page.getByText(/Official Apple Ads scores, labeled/i),
  ).toBeVisible();
});

test("core surfaces have no horizontal overflow at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });

  for (const path of ["/", "/assistant", "/pricing"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();

    const pageOverflow = await page.evaluate(
      () =>
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - document.documentElement.clientWidth,
    );
    expect(
      pageOverflow,
      `horizontal overflow on ${path}: ${pageOverflow}px`,
    ).toBeLessThanOrEqual(0);

    // The primary interactive surface must still be reachable at this width.
    if (path === "/") {
      await expect(page.getByPlaceholder(/meditation/)).toBeVisible();
    } else if (path === "/assistant") {
      await expect(page.getByLabel("Message the ASO assistant")).toBeVisible();
    } else {
      await expect(page.getByText("Free", { exact: true }).first()).toBeVisible();
    }
  }
});

test("core surfaces have no horizontal overflow at 768px (tablet)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });

  for (const path of ["/", "/assistant", "/pricing", "/app-store-keywords"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();

    const pageOverflow = await page.evaluate(
      () =>
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - document.documentElement.clientWidth,
    );
    expect(
      pageOverflow,
      `horizontal overflow on ${path}: ${pageOverflow}px`,
    ).toBeLessThanOrEqual(0);

    // The chat history drawer/tablet layout must keep the composer reachable.
    if (path === "/assistant") {
      await expect(page.getByLabel("Message the ASO assistant")).toBeVisible();
    }
  }
});

test("core surfaces have no horizontal overflow at 1024px and 1920px", async ({
  page,
}) => {
  for (const [width, height] of [
    [1024, 768],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width, height });

    for (const path of ["/", "/assistant", "/pricing", "/app-store-keywords"]) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();

      const pageOverflow = await page.evaluate(
        () =>
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - document.documentElement.clientWidth,
      );
      expect(
        pageOverflow,
        `horizontal overflow on ${path} at ${width}px: ${pageOverflow}px`,
      ).toBeLessThanOrEqual(0);

      // At ≥900px the assistant history sidebar is open by default; the
      // composer must still fit and stay reachable beside it.
      if (path === "/assistant") {
        await expect(page.getByLabel("Message the ASO assistant")).toBeVisible();
        await expect(page.getByLabel("Toggle chat history")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      }
    }
  }
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
    "/icons/v2/favicon.ico",
    "/icons/v2/icon.svg",
    "/icons/v2/icon-192.png",
    "/icons/v2/apple-touch-icon.png",
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

test("marketing mobile nav drawer fits 375px without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/about");

  await page.getByRole("button", { name: /Open navigation menu/i }).click();
  await expect(
    page.locator(".marketing-mobile-drawer"),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow: ${overflow}px`).toBeLessThanOrEqual(0);

  // Every drawer link is reachable and the drawer closes on selection.
  for (const label of ["Keyword Explorer", "Pricing", "ASO Guide"]) {
    await expect(
      page
        .locator(".marketing-mobile-nav")
        .getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }
  await page
    .locator(".marketing-mobile-nav")
    .getByRole("link", { name: "Pricing", exact: true })
    .click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.locator(".marketing-mobile-drawer")).toHaveCount(0);
});

test("unknown URLs render the 404 page with a 404 status", async ({
  page,
}) => {
  const response = await page.goto("/definitely-not-a-real-page");
  expect(response?.status()).toBe(404);
  dismissExpectedConsoleErrors(page, [/Failed to load resource.*404/]);

  await expect(
    page.getByRole("heading", { name: /This page is not in the index/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Search keywords/i }),
  ).toBeVisible();
});

test("404 page stays usable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const response = await page.goto("/nope-nope-nope");
  expect(response?.status()).toBe(404);
  dismissExpectedConsoleErrors(page, [/Failed to load resource.*404/]);

  const overflow = await page.evaluate(
    () =>
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow: ${overflow}px`).toBeLessThanOrEqual(0);
  await expect(
    page.getByRole("heading", { name: /This page is not in the index/i }),
  ).toBeVisible();
});

test("every page emits parseable, non-empty JSON-LD", async ({ page }) => {
  const pages = [
    "/",
    "/about",
    "/pricing",
    "/app-store-keywords",
    "/guides/keyword-research",
    "/blog",
    "/blog/app-store-conversion-rate",
    "/privacy",
    "/terms",
    "/refunds",
    "/assistant",
  ];

  for (const path of pages) {
    await page.goto(path);
    const parsed = await page.evaluate(() => {
      const scripts = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      );
      return scripts.map((script) => {
        try {
          const value = JSON.parse(script.textContent ?? "");
          return {
            ok: true,
            keys: Array.isArray(value) ? [] : Object.keys(value),
            hasType: Boolean(value && (value["@type"] || Array.isArray(value) && value.some((v) => v?.["@type"]))),
          };
        } catch {
          return { ok: false, keys: [], hasType: false };
        }
      });
    });
    expect(
      parsed.length,
      `${path} should emit at least one JSON-LD block`,
    ).toBeGreaterThan(0);
    expect(parsed.every((entry) => entry.ok), `${path} JSON-LD must parse`).toBe(
      true,
    );
  }
});

test("marketing navigation and CTA work interactively at 1920px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });

  for (const [path, heading, primaryLabel] of [
    ["/app-store-keywords", /Popularity from Apple/i, "Open Explorer"],
    ["/guides/keyword-research", /practical guide to App Store keyword research/i, "Open Explorer"],
    ["/about", /We show Apple/i, "Open Explorer"],
    ["/blog", /Understand App Store search/i, "Open Explorer"],
  ] as const) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();

    // 0px horizontal overflow at 1920.
    const overflow = await page.evaluate(
      () =>
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} overflow: ${overflow}px`).toBeLessThanOrEqual(0);

    // The desktop nav links and the exploration CTA are reachable.
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Pricing", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: primaryLabel, exact: true }),
    ).toBeVisible();
  }

  // Navigating via the nav links works at this width.
  await page.goto("/app-store-keywords");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Pricing", exact: true })
    .click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(
    page.getByRole("heading", { level: 1, name: /Honest limits on Free/i }),
  ).toBeVisible();
});
