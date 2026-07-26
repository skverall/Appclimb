import { defineConfig, devices } from "@playwright/test";

const appURL = "http://127.0.0.1:3101";
const accountLifecycleEnabled =
  process.env.APPCLIMB_E2E_ACCOUNT_LIFECYCLE === "1";
const isolatedBackendEnvironment =
  process.env.APPCLIMB_E2E_ISOLATED_BACKEND_URL?.trim();

const productionBackendHosts = new Set([
  "appclimb.app",
  "www.appclimb.app",
  "appclimb-api.aydmaxx.workers.dev",
  "appclimb.srv1300823.hstgr.cloud",
]);

function resolveIsolatedBackendURL() {
  if (!accountLifecycleEnabled) return undefined;

  if (!isolatedBackendEnvironment) {
    throw new Error(
      [
        "Account lifecycle E2E is disabled unless an isolated backend is explicit.",
        "Set APPCLIMB_E2E_ISOLATED_BACKEND_URL to a disposable backend URL.",
      ].join(" "),
    );
  }

  let backendURL: URL;
  try {
    backendURL = new URL(isolatedBackendEnvironment);
  } catch {
    throw new Error(
      "APPCLIMB_E2E_ISOLATED_BACKEND_URL must be a valid http(s) URL.",
    );
  }

  if (!["http:", "https:"].includes(backendURL.protocol)) {
    throw new Error(
      "APPCLIMB_E2E_ISOLATED_BACKEND_URL must use http or https.",
    );
  }

  const hostname = backendURL.hostname.toLowerCase();
  if (
    productionBackendHosts.has(hostname) ||
    hostname.endsWith(".appclimb.app")
  ) {
    throw new Error(
      `Refusing to run account lifecycle E2E against production host "${hostname}".`,
    );
  }

  return backendURL.toString();
}

const isolatedBackendURL = resolveIsolatedBackendURL();
// Safe demo tests must never inherit the production fallback from src/lib/backend.
const backendURL =
  isolatedBackendURL ?? "http://127.0.0.1:65535/__e2e_backend_disabled__";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: accountLifecycleEnabled ? [] : ["**/*.isolated.spec.ts"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: appURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: {
    command:
      "npm run build && npm run start -- --hostname 127.0.0.1 --port 3101",
    url: `${appURL}/pricing`,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      APPCLIMB_API_URL: backendURL,
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
