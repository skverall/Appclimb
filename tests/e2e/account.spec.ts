import { expect, test } from "./runtime-test";

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
