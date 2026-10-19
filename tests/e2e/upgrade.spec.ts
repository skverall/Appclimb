import { expect, test } from "./runtime-test";

type Me = {
  configured: true;
  user: { id: string; email: string; name: string } | null;
  plan: "free" | "pro";
  subscription: null | { status: string; current_period_end: string | null };
};

const GUEST: Me = { configured: true, user: null, plan: "free", subscription: null };
const FREE: Me = {
  configured: true,
  user: { id: "u1", email: "free@example.com", name: "Free" },
  plan: "free",
  subscription: null,
};
const PRO: Me = { ...FREE, plan: "pro", subscription: { status: "active", current_period_end: null } };

async function mockMe(page: import("@playwright/test").Page, me: Me) {
  await page.unroute("**/api/me");
  await page.route("**/api/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(me) });
  });
}

/** Signed-in visitors see a one-time welcome; mark it seen for user u1. */
async function skipOnboarding(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("appclimb:onboarded:v1", "u1");
  });
}

async function useUpChecks(page: import("@playwright/test").Page, count: number) {
  await page.evaluate((used) => {
    const day = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem("appclimb:explorer:day", JSON.stringify({ day, count: used }));
  }, count);
}

test("a guest's plan choice survives sign-in and reopens checkout", async ({ page }) => {
  await mockMe(page, GUEST);
  await page.goto("/pricing");

  await page.getByRole("tab", { name: /Monthly/ }).click();
  await page.getByRole("button", { name: /Get Pro/ }).first().click();
  const dialog = page.getByRole("dialog", { name: /Upgrade to Pro/ });
  await expect(dialog.getByRole("radio", { name: /Monthly/ })).toBeChecked();
  await dialog.getByRole("button", { name: /Sign in & get Pro — \$8\/month/ }).click();

  const auth = page.getByRole("dialog", { name: /Sign in to finish upgrading/ });
  await expect(auth).toBeVisible();
  await expect(auth.getByText("Secure checkout")).toBeVisible();
  // Google returns to the page the visitor signed in from.
  await expect(auth.getByRole("link", { name: /Continue with Google/ })).toHaveAttribute(
    "href",
    "/api/auth/google?next=%2Fpricing",
  );

  // Back from sign-in: the dialog reopens with the monthly plan they picked.
  await mockMe(page, FREE);
  await page.goto("/pricing?auth=ok");
  const reopened = page.getByRole("dialog", { name: /Upgrade to Pro/ });
  await expect(reopened).toBeVisible();
  await expect(reopened.getByRole("radio", { name: /Monthly/ })).toBeChecked();
  await expect(reopened.getByRole("button", { name: /Get Pro — \$8\/month/ })).toBeVisible();

  // It reopens once, not on every page load.
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: /Search free/ })).toBeVisible();
  await expect(page.getByRole("dialog", { name: /Upgrade to Pro/ })).toHaveCount(0);
});

test("the magic link returns to the page it was requested from", async ({ page }) => {
  await mockMe(page, GUEST);
  let body: { email?: string; next?: string } | null = null;
  await page.route("**/api/auth/magic-link", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.goto("/pricing");
  await page.getByRole("button", { name: /Get Pro/ }).first().click();
  await page.getByRole("button", { name: /Sign in & get Pro/ }).click();
  await page.getByLabel("Email").fill("dev@example.com");
  await page.getByRole("button", { name: /Email me a sign-in link/ }).click();
  await expect(page.getByText(/We sent a sign-in link/)).toContainText(/checkout opens right after/i);
  expect(body).toEqual({ email: "dev@example.com", next: "/pricing" });
});

test("a free account at its daily limit gets the Pro offer on the next search", async ({ page }) => {
  await skipOnboarding(page);
  await mockMe(page, FREE);
  await page.goto("/");
  await useUpChecks(page, 30);
  await page.reload();

  const search = page.getByRole("combobox", { name: "Search keywords" });
  await search.fill("habit tracker");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: /Upgrade to Pro/ });
  await expect(dialog.getByRole("heading", { name: /used today’s free checks/ })).toBeVisible();
  await expect(dialog.locator(".upgrade-features li").first()).toContainText("Unlimited keyword checks");
  await page.keyboard.press("Escape");
  // What they typed is still there.
  await expect(search).toHaveValue("habit tracker");
});

test("free accounts see an unlimited nudge when few checks remain", async ({ page }) => {
  await skipOnboarding(page);
  await mockMe(page, FREE);
  await page.goto("/");
  await useUpChecks(page, 26);
  await page.reload();
  await expect(page.getByText(/4 of 30 checks left today/)).toBeVisible();
  await page.getByRole("button", { name: "Unlimited with Pro" }).click();
  await expect(page.getByRole("dialog", { name: /Upgrade to Pro/ })).toBeVisible();
});

test("a guest at the daily limit is offered a free account, or Pro instead", async ({ page }) => {
  await mockMe(page, GUEST);
  await page.goto("/");
  await useUpChecks(page, 8);
  await page.reload();

  await page.getByRole("combobox", { name: "Search keywords" }).fill("budget app");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  const auth = page.getByRole("dialog", { name: /Get 30 keyword checks a day, free/ });
  await expect(auth).toBeVisible();
  await auth.getByRole("button", { name: /skip limits entirely with Pro/ }).click();
  await expect(auth).toHaveCount(0);
  const upgrade = page.getByRole("dialog", { name: /Upgrade to Pro/ });
  await expect(upgrade.getByRole("heading", { name: /used today’s free checks/ })).toBeVisible();
  await expect(upgrade.getByRole("button", { name: /Sign in & get Pro/ })).toBeVisible();
});

test("the header Go Pro button is for free accounts only", async ({ page }) => {
  await skipOnboarding(page);
  await mockMe(page, FREE);
  await page.goto("/pricing");
  await page.getByRole("button", { name: "Go Pro" }).click();
  const dialog = page.getByRole("dialog", { name: /Upgrade to Pro/ });
  await expect(dialog.getByRole("heading", { name: /keywords you can actually win/ })).toBeVisible();
  await dialog.getByRole("button", { name: /Close upgrade dialog/ }).click();
  await expect(dialog).toHaveCount(0);

  await mockMe(page, PRO);
  await page.route("**/api/sync?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: 0, json: null, updated_at: null }),
    });
  });
  await page.reload();
  await expect(page.getByRole("button", { name: /Pro/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Go Pro" })).toHaveCount(0);
});

test("after checkout the welcome dialog waits for the webhook, then confirms Pro", async ({ page }) => {
  await skipOnboarding(page);
  let plan: "free" | "pro" = "free";
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(plan === "pro" ? PRO : FREE),
    });
  });
  await page.route("**/api/sync?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: 0, json: null, updated_at: null }),
    });
  });
  await page.goto("/?checkout=success");

  const welcome = page.getByRole("dialog", { name: /Welcome to AppClimb Pro/ });
  await expect(welcome.getByText(/Activating your plan/)).toBeVisible();
  plan = "pro";
  await expect(welcome.getByText(/Pro is active for free@example.com/)).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/$/);
  await welcome.getByRole("button", { name: /Start using Pro/ }).click();
  await expect(welcome).toHaveCount(0);
});

test("first-sign-in onboarding waits until the upgrade dialog closes", async ({ page }) => {
  await mockMe(page, GUEST);
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem(
      "appclimb:upgrade:pending:v1",
      JSON.stringify({ cycle: "yearly", reason: "apps", at: Date.now() }),
    );
  });

  await mockMe(page, FREE);
  await page.goto("/?auth=ok");
  const upgrade = page.getByRole("dialog", { name: /Upgrade to Pro/ });
  await expect(upgrade.getByRole("heading", { name: /Track every app you ship/ })).toBeVisible();
  const onboarding = page.getByRole("dialog", { name: /^Welcome to AppClimb$/ });
  await expect(onboarding).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(upgrade).toHaveCount(0);
  await expect(onboarding).toBeVisible();
});
