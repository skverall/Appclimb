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
