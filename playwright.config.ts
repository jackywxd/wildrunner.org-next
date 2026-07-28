import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

/**
 * Playwright E2E gate for Payload migration.
 * @see https://playwright.dev/docs/test-configuration
 */
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    // Payload ignores the auth cookie on requests carrying neither `Origin`
    // nor `Sec-Fetch-Site` — it treats them as non-browser clients (CSRF
    // protection, active since `serverURL` is configured). Browsers always
    // send one of the two; APIRequestContext sends neither, so every API
    // call here would silently authenticate as nobody.
    extraHTTPHeaders: { Origin: BASE_URL },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "cross-env NEXTJS_ENV=test pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
