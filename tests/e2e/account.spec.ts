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
