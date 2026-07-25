import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
} from "@playwright/test";

type RuntimeIssues = {
  consoleErrors: string[];
  pageErrors: string[];
};

const issuesByPage = new WeakMap<Page, RuntimeIssues>();

test.beforeEach(async ({ page }) => {
  const issues: RuntimeIssues = {
    consoleErrors: [],
    pageErrors: [],
  };
  issuesByPage.set(page, issues);

  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") {
      issues.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    issues.pageErrors.push(error.message);
  });
});

test.afterEach(async ({ page }) => {
  const issues = issuesByPage.get(page);

  expect(
    issues?.consoleErrors ?? [],
    "The page emitted console.error messages.",
  ).toEqual([]);
  expect(issues?.pageErrors ?? [], "The page emitted uncaught errors.").toEqual(
    [],
  );

  if (!page.isClosed()) {
    await expect(
      page.locator("nextjs-portal, [data-nextjs-dialog-overlay]"),
      "A Next.js error or issues overlay is mounted.",
    ).toHaveCount(0);
  }
});

export { expect, test };
