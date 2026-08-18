import { expect, test } from "./runtime-test";

// Minimal iTunes catalog + icon mocks so tracker flows can run here too.
async function mockItunesLike(page: import("@playwright/test").Page) {
  const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.route("https://is1-ssl.mzstatic.com/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
  });
  await page.route("https://itunes.apple.com/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/lookup")) {
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
              description: "Manage vehicle inventory, track sales, expenses, and profit.",
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
        resultCount: 1,
        results: [
          {
            trackId: 111,
            trackName: "Competitor App",
            sellerName: "Other Co",
            primaryGenreName: "Business",
            userRatingCount: 500,
            averageUserRating: 4.2,
          },
        ],
      }),
    });
  });
}



test("pricing page lists the free plan with honest limits and Pro at $8", async ({
  page,
}) => {
  await page.goto("/pricing");

  await expect(
    page.getByRole("heading", { name: /Honest limits on Free/i }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Free", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pro", exact: true })).toBeVisible();

  // The free plan states its real limits instead of "unlimited everything".
  await expect(page.getByText(/8 keyword checks per day/i)).toBeVisible();
  await expect(page.getByText(/5 messages/i)).toBeVisible();

  // Monthly price first, then the yearly toggle shows the annual price.
  await expect(page.getByText(/\$8/i).first()).toBeVisible();
  await page.getByRole("tab", { name: /Yearly/i }).click();
  await expect(page.getByText(/\$64/i).first()).toBeVisible();
  await expect(page.getByText(/save 33%/i)).toBeVisible();
});

test("/api/me serves the anonymous free-tier shape", async ({ request }) => {
  const response = await request.get("/api/me");
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    configured: boolean;
    user: unknown;
    plan: string;
    limits: { explorerChecksPerDay: number; aiMessagesPerDay: number };
  };
  expect(body.user).toBeNull();
  expect(body.plan).toBe("free");
  expect(body.limits.explorerChecksPerDay).toBe(8);
  expect(body.limits.aiMessagesPerDay).toBe(5);
});

test("sign-up endpoints degrade gracefully without a backend", async ({
  request,
}) => {
  const response = await request.post("/api/auth/magic-link", {
    data: { email: "test@example.com" },
  });
  expect(response.status()).toBe(503);
  const body = (await response.json()) as { configured?: boolean };
  expect(body.configured).toBe(false);

  const sync = await request.get("/api/sync?blob=tracker");
  expect(sync.status()).toBe(503);
});

test("magic-link submit is single-flight (no double email)", async ({
  page,
}) => {
  let calls = 0;
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
  await page.route("**/api/auth/magic-link", async (route) => {
    calls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, email: "dev@example.com" }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Sign in/i }).first().click();
  await expect(page.getByRole("heading", { name: /Sign in/i }).first()).toBeVisible();

  const emailInput = page.getByLabel("Email");
  await emailInput.fill("dev@example.com");
  await page.getByRole("button", { name: /Email me a sign-in link/i }).click();

  // Force a second submit through the form event (the button is disabled
  // after the first click, so only an explicit event can re-enter the handler).
  await page.evaluate(() => {
    const form = document.querySelector(".auth-email-form");
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  await expect(page.getByText(/Check your inbox/i)).toBeVisible({
    timeout: 10_000,
  });
  expect(calls).toBe(1);
});

test("sign out clears free-plan workspace data after confirmation", async ({
  page,
}) => {
  await mockItunesLike(page);
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        user: { id: "u1", email: "free@example.com", name: "Free" },
        plan: "free",
        subscription: null,
      }),
    });
  });

  await page.goto("/");
  const notNow = page.getByRole("button", { name: /Not now/i });
  if (await notNow.isVisible().catch(() => false)) {
    await notNow.click();
  }
  await page.getByRole("button", { name: /Try a sample app/i }).click();
  await expect(
    page.getByRole("heading", { name: /Car Dealer Tracker: Profit/i }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".tracker-table tbody tr")).toHaveCount(7, {
    timeout: 30_000,
  });
  expect(
    await page.evaluate(() => Boolean(window.localStorage.getItem("appclimb:tracker:v1"))),
  ).toBe(true);

  // Sign out from the account menu; the free-plan confirmation is accepted.
  await page.getByRole("button", { name: /Free/i }).first().click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("menuitem", { name: /Sign out/i }).click();
  await expect(page.getByText(/Signed out/i).first()).toBeVisible({
    timeout: 10_000,
  });

  // The workspace data is gone from this device.
  expect(
    await page.evaluate(() => window.localStorage.getItem("appclimb:tracker:v1")),
  ).toBeNull();
});

test("manage subscription opens the portal links for a canceled Pro plan", async ({
  page,
}) => {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        user: { id: "u1", email: "pro@example.com", name: "Pro" },
        plan: "pro",
        subscription: {
          status: "active",
          current_period_end: "2026-09-01T00:00:00Z",
          cancel_at_period_end: true,
        },
      }),
    });
  });
  await page.route("**/api/sync?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: 0, json: null, updated_at: null }),
    });
  });
  await page.route("**/api/billing/portal", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        updatePaymentMethod: "https://paddle.example/update",
        cancel: "https://paddle.example/cancel",
      }),
    });
  });

  await page.goto("/");
  const closeWelcome = page.getByRole("button", { name: /Close welcome dialog/i });
  try {
    await closeWelcome.waitFor({ state: "visible", timeout: 3_000 });
    await closeWelcome.click();
  } catch {
    // No onboarding modal for this account state — proceed.
  }
  await page.getByRole("button", { name: /Pro/i }).first().click();

  await page.evaluate(() => {
    window.open = ((url?: string | URL | null) => {
      (window as unknown as { __openedUrl?: string }).__openedUrl =
        url === null || url === undefined ? "" : String(url);
      return null;
    }) as typeof window.open;
  });

  await page.getByRole("menuitem", { name: /Manage subscription/i }).click();
  await expect(page.getByRole("menuitem", { name: /Manage subscription/i })).toHaveCount(0);

  const opened = await page.evaluate(
    () => (window as unknown as { __openedUrl?: string }).__openedUrl ?? "",
  );
  expect(opened).toBe("https://paddle.example/update");
});
