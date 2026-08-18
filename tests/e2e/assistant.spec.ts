import { expect, test } from "./runtime-test";

const SUGGESTION =
  "Which of my tracked keywords are worth focusing on first?";

test("assistant replies to a message and persists the thread", async ({
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as {
      message: string;
      messages: Array<{ role: string; content: string }>;
      context: unknown;
    };
    expect(body.message).toBe(SUGGESTION);
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
    expect(body.context).toBeNull(); // no My Apps tracker context yet
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message:
          "Start with **long-tail** keywords like “habit tracker” — solid demand, less competition.",
        remainingDay: 19,
        remainingHour: 5,
      }),
    });
  });

  await page.goto("/assistant");
  await expect(page.getByText(/ASO assistant \(DeepSeek V4 Flash\)/i)).toBeVisible();

  // Suggestion chips are offered before the first user message.
  const chip = page.getByRole("button", { name: SUGGESTION });
  await expect(chip).toBeVisible();
  await chip.click();

  // The markdown reply renders and the server-reported quota is shown.
  await expect(page.getByText(/Start with/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/19 of 60 messages left today/i)).toBeVisible();
  await expect(page.getByText(SUGGESTION)).toBeVisible();

  // The thread survives a reload (stored in localStorage).
  await page.reload();
  await expect(page.getByText(/Start with/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(SUGGESTION)).toBeVisible();

  // Clearing resets to the welcome state (confirm dialog accepted).
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: /Clear conversation/i }).click();
  await expect(page.getByText(/Start with/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: SUGGESTION }),
  ).toBeVisible();
});

test("conversation history: new chat, switch back, delete", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/chat", async (route) => {
    calls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: `reply ${calls}`,
        remainingDay: 19,
        remainingHour: 5,
      }),
    });
  });

  await page.goto("/assistant");
  await page.getByRole("button", { name: SUGGESTION }).click();
  await expect(page.getByText(/reply 1/i)).toBeVisible({ timeout: 15_000 });

  // A new chat shows the welcome state; the old thread stays in history.
  await page.locator(".ai-chat-new-button").click();
  await expect(page.getByText(/reply 1/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: SUGGESTION })).toBeVisible();

  // The sidebar lists the first chat, titled (truncated) from its first
  // user message.
  const historyList = page.locator(".ai-chat-history-list");
  const firstChat = historyList.getByRole("button", {
    name: /^(?!Delete conversation: )Which of my tracked keywords are worth focusing/i,
  });
  await expect(firstChat).toBeVisible();
  await firstChat.click();
  await expect(page.getByText(/reply 1/i)).toBeVisible();

  // Deleting the empty chat keeps the remaining conversation active.
  page.once("dialog", (dialog) => void dialog.accept());
  await historyList
    .getByRole("button", { name: "Delete conversation: New chat" })
    .click();
  await expect(page.getByText(/reply 1/i)).toBeVisible();
  await expect(historyList.locator("li")).toHaveCount(1);

  // History survives a reload.
  await page.reload();
  await expect(page.getByText(/reply 1/i)).toBeVisible({ timeout: 10_000 });
  await expect(historyList.locator("li")).toHaveCount(1);
});

test("failed sends keep the draft and do not commit the message", async ({
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({ status: 500, body: "{}" });
  });

  await page.goto("/assistant");
  await page
    .getByLabel("Message the ASO assistant")
    .fill("a draft that must survive the failure");
  await page.getByRole("button", { name: "Send" }).click();

  // The error is surfaced, the draft is restored for retry, and the failed
  // message did not enter the thread/history (it never reached the model).
  await expect(page.locator(".ai-chat-error")).toContainText(
    /Assistant request failed/i,
    { timeout: 15_000 },
  );
  await expect(page.getByLabel("Message the ASO assistant")).toHaveValue(
    "a draft that must survive the failure",
  );
  await expect(page.locator(".ai-chat-bubble--user")).toHaveCount(0);

  // A retry from the restored draft works once the backend recovers.
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "recovered reply",
        remainingDay: 19,
        remainingHour: 5,
      }),
    });
  });
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/recovered reply/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel("Message the ASO assistant")).toHaveValue("");
  await expect(page.locator(".ai-chat-bubble--user")).toHaveCount(1);
});

test("assistant shows the daily-limit gate at zero remaining messages", async ({
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "last reply", remainingDay: 0 }),
    });
  });

  await page.goto("/assistant");
  // Prime the client-side counter to the cap so the next send would be
  // rejected locally, then hand back a server reply reporting 0 remaining.
  await page.evaluate(() => {
    const day = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem(
      "appclimb:ai:day",
      JSON.stringify({ day, count: 59 }),
    );
  });
  await page.getByLabel("Message the ASO assistant").fill("last message");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/last reply/i)).toBeVisible({ timeout: 15_000 });

  // With 0 messages left the composer is replaced by an honest limit gate
  // instead of an always-enabled input that can only fail.
  await expect(page.getByLabel("Message the ASO assistant")).toHaveCount(0);
  await expect(page.getByText(/used up/i)).toBeVisible();
});

test("assistant surfaces rate-limit and local-limit errors", async ({
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({ status: 429, body: "{}" });
  });

  await page.goto("/assistant");
  await page.getByLabel("Message the ASO assistant").fill("suggest keywords");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".ai-chat-error")).toContainText(/Rate limit reached/i, {
    timeout: 15_000,
  });

  // The client-side daily cap blocks without ever hitting the server.
  await page.evaluate(() => {
    const day = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem(
      "appclimb:ai:day",
      JSON.stringify({ day, count: 999 }),
    );
  });
  await page.getByLabel("Message the ASO assistant").fill("more keywords");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".ai-chat-error")).toContainText(/assistant limit/i, {
    timeout: 15_000,
  });
});

test("IME composition Enter does not send the message", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/chat", async (route) => {
    calls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "reply", remainingDay: 19 }),
    });
  });

  await page.goto("/assistant");
  const input = page.getByLabel("Message the ASO assistant");
  await input.fill("日本語のキーワード");

  // Pressing Enter to confirm IME composition must not send.
  await page.evaluate(() => {
    const textarea = document.querySelector(
      'textarea[aria-label="Message the ASO assistant"]',
    );
    textarea?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
        isComposing: true,
      }),
    );
  });
  await expect(page.locator(".ai-chat-bubble--user")).toHaveCount(0);
  expect(calls).toBe(0);

  // A regular Enter still sends.
  await input.press("Enter");
  await expect(page.getByText(/reply/i)).toBeVisible({ timeout: 15_000 });
  expect(calls).toBe(1);
});

test("chat history drawer stays usable at 375px", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/chat", async (route) => {
    calls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "drawer reply",
        remainingDay: 19,
        remainingHour: 5,
      }),
    });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/assistant");
  await page.getByRole("button", { name: SUGGESTION }).click();
  await expect(page.getByText(/drawer reply/i)).toBeVisible({
    timeout: 15_000,
  });
  expect(calls).toBe(1);

  // Open the history drawer on a phone-sized viewport.
  await page.getByRole("button", { name: /Chat history/i }).click();
  await expect(
    page.locator(".ai-chat-history-popover, .ai-chat-history-sidebar.is-open"),
  ).toBeVisible();

  // The drawer must not push the page horizontally.
  const overflow = await page.evaluate(
    () =>
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow: ${overflow}px`).toBeLessThanOrEqual(0);

  // Picking a chat from the drawer closes it and keeps the composer visible.
  await page.locator(".ai-chat-history-list").getByRole("button").first().click();
  await expect(
    page.locator(".ai-chat-history-popover, .ai-chat-history-sidebar.is-open"),
  ).toHaveCount(0);
  await expect(page.getByLabel("Message the ASO assistant")).toBeVisible();
});

test("upgrading mid-session unlocks the composer gate", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "last free reply", remainingDay: 0 }),
    });
  });
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        user: { id: "u1", email: "dev@example.com", name: "Dev" },
        plan: "free",
        subscription: null,
      }),
    });
  });

  await page.goto("/assistant");
  await page.getByLabel("Message the ASO assistant").fill("hello");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/last free reply/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/used up/i)).toBeVisible();

  // The user upgrades mid-session: /api/me reports Pro and the post-checkout
  // refresh runs (the real upgrade flow navigates back with ?checkout=success).
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        user: { id: "u1", email: "dev@example.com", name: "Dev" },
        plan: "pro",
        subscription: {
          status: "active",
          current_period_end: null,
          cancel_at_period_end: false,
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
  await page.goto("/assistant?checkout=success");

  await expect(page.getByText(/used up/i)).toHaveCount(0);
  await expect(page.getByLabel("Message the ASO assistant")).toBeVisible();

  // The upgraded session can send again.
  await page.getByLabel("Message the ASO assistant").fill("more");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/last free reply/i)).toHaveCount(2, {
    timeout: 15_000,
  });
});
