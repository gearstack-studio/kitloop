import { defineConfig, devices } from "@playwright/test";

// Spec 09 (CR-01 STS TC11, TC12, TC18 at E level): an isolated, quota-ENABLED copy of the e2e environment.
// It never shares a database, port or output folder with the quota-off suite in playwright.config.ts (specs 01-08).
// The values are set before support/env is loaded (require, not import, so the assignments run first); the shared
// global setup and teardown then create, migrate, seed and drop this dedicated database.
process.env.E2E_DB_NAME = "kitloop_e2e_quota";
process.env.E2E_API_PORT ??= "3101";
process.env.E2E_WEB_PORT ??= "5175";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const env = require("./support/env") as typeof import("./support/env");

export default defineConfig({
  testDir: "./tests",
  testMatch: /09-borrowing-quota\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0, // quota journeys are serial and stateful; a retry would run against changed data
  forbidOnly: !!process.env.CI,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  outputDir: "test-results-quota/artifacts",
  globalSetup: ["./support/global-setup.ts", "./support/quota-global-setup.ts"],
  globalTeardown: "./support/global-teardown.ts",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report-quota" }],
    ["json", { outputFile: "test-results-quota/results.json" }],
  ],
  use: {
    baseURL: env.APP_ORIGIN,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
  },
  projects: [{ name: "chromium-quota", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx tsx src/index.ts",
      cwd: env.SERVER_DIR,
      url: `${env.API_BASE}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: env.e2eDatabaseUrl(),
        APP_ORIGIN: env.APP_ORIGIN,
        PORT: String(env.API_PORT),
        SESSION_CSRF_SECRET: process.env.E2E_SESSION_SECRET!,
        REQUEST_LIFECYCLE_WRITES: "enabled",
        BORROWING_QUOTA: "enabled", // the only flag difference from playwright.config.ts
        LOAN_MAX_DAYS: "21",
      },
    },
    {
      command: `npx vite --host localhost --port ${env.WEB_PORT} --strictPort`,
      cwd: env.CLIENT_DIR,
      url: env.APP_ORIGIN,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_BASE_URL: env.API_ORIGIN },
    },
  ],
});
