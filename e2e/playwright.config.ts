import { defineConfig, devices } from "@playwright/test";
import { API_BASE, API_ORIGIN, API_PORT, APP_ORIGIN, CLIENT_DIR, SERVER_DIR, WEB_PORT, e2eDatabaseUrl } from "./support/env";

// KitLoop browser e2e. One worker, serial journeys: tests build on data created earlier in the same spec file,
// and checkout cannot be undone until the return feature exists, so every run starts from a freshly created database.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  outputDir: "test-results/artifacts",
  globalSetup: "./support/global-setup.ts",
  globalTeardown: "./support/global-teardown.ts",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: APP_ORIGIN,
    // Failure artifacts: screenshot, trace (open with `npx playwright show-trace`) and video are kept only when a test fails.
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    // Optional system browser instead of the downloaded Chromium, e.g. E2E_BROWSER_CHANNEL=msedge.
    ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Express API against the dedicated e2e database. reuseExistingServer is off so a developer's server (which could be
      // pointing at the development database) is never picked up; the ports differ from the dev defaults for the same reason.
      command: "npx tsx src/index.ts",
      cwd: SERVER_DIR,
      url: `${API_BASE}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: e2eDatabaseUrl(),
        APP_ORIGIN,
        PORT: String(API_PORT),
        SESSION_CSRF_SECRET: process.env.E2E_SESSION_SECRET!,
      },
    },
    {
      // Vite dev server pointed at that API.
      command: `npx vite --host localhost --port ${WEB_PORT} --strictPort`,
      cwd: CLIENT_DIR,
      url: APP_ORIGIN,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_BASE_URL: API_ORIGIN },
    },
  ],
});
