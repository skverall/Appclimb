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

/**
 * Drop console errors that are intentionally provoked (e.g. mocked Apple 429)
 * or are browser noise for allowed external icon hosts during tests.
 */
export function dismissExpectedConsoleErrors(
  page: Page,
  patterns: RegExp[],
): void {
  const issues = issuesByPage.get(page);
  if (!issues) return;
  issues.consoleErrors = issues.consoleErrors.filter(
    (message) => !patterns.some((pattern) => pattern.test(message)),
  );
}

test.afterEach(async ({ page }) => {
  const issues = issuesByPage.get(page);

  // Browser always logs failed network responses as console.error. When tests
  // mock temporary Apple rate limits, those lines are expected noise.
  if (issues) {
    issues.consoleErrors = issues.consoleErrors.filter(
      (message) =>
        !(
          message.includes("Failed to load resource") &&
          (message.includes("429") || message.includes("403") || message.includes("500"))
        ),
    );
  }

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
