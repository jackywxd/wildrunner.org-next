import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

/**
 * Playwright E2E gate for Payload migration.
 * @see https://playwright.dev/docs/test-configuration
 */
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * Only spin up `pnpm dev` when the target *is* this machine. Pointed at
 * staging (or any deployed origin) a local server is dead weight: it would
 * still be built and waited on for up to 180s, and it needs a PAYLOAD_SECRET
 * and local D1 that a deploy-verification job has no reason to provide.
 */
const isLocalTarget = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(
  BASE_URL,
);

/**
 * Uploads push tens of megabytes to R2 through a Worker. Against a remote
 * origin that routinely passes 30s — measured on staging: V0-T5 42s,
 * V2-T1 52s, V3-T3 1.6m — so the per-test budget has to be bigger there.
 */
const TIMEOUT = isLocalTarget ? 30_000 : 300_000;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: TIMEOUT,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    // Payload ignores the auth cookie on requests carrying neither `Origin`
    // nor `Sec-Fetch-Site` — it treats them as non-browser clients (CSRF
    // protection, active since `serverURL` is configured). Browsers always
    // send one of the two; APIRequestContext sends neither, so every API
    // call here would silently authenticate as nobody.
    extraHTTPHeaders: { Origin: BASE_URL },
    // The admin panel's language comes from Accept-Language before it falls
    // back to `i18n.fallbackLanguage`, and `en` is a supported language, so
    // Chromium's default `en-US` makes Payload render the panel in English.
    // Our members are Traditional Chinese speakers; pinning the locale is what
    // makes the browser under test one of them, rather than leaving the thing
    // the i18n specs assert on decided by a Playwright default.
    locale: "zh-TW",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: isLocalTarget
    ? {
        command: "cross-env NEXTJS_ENV=test pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      }
    : undefined,
});
