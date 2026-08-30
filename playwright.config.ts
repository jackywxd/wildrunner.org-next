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
export const isLocalTarget = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(
  BASE_URL,
);

/**
 * Uploads push tens of megabytes to R2 through a Worker. Against a remote
 * origin that routinely passes 30s — measured on staging: V0-T5 42s,
 * V2-T1 52s, V3-T3 1.6m — so the per-test budget has to be bigger there.
 *
 * 20s locally, from the distribution rather than from a feeling. Measured over
 * 275 passing tests in a green CI run:
 *
 *   p50 0.6s   p90 5.0s   p95 8.1s   p99 16.2s   max 26.4s
 *
 * Only four run past 15s and they declare it with `test.setTimeout`. The point
 * is not to save time when tests pass — it is that a *failing* test costs 20s
 * instead of 30s, and with `retries: 0` that is 20s instead of 105s. A shard
 * that used to take 15m32s to report eight failures now reports them in under
 * three.
 *
 * Not lower: N-T5 spent weeks looking flaky because a 5s budget met a 5.2s
 * cold route. 20s clears the measured p99 by a wide margin.
 *
 * Two caveats, because the numbers above are now history. They were measured
 * on the 275-test suite that #36 deleted, so treat them as the reason 20s was
 * chosen rather than as a description of what runs today. And the `max 26.4s`
 * in that distribution was real: `P0-T6` blew this budget on a cold CI runner,
 * not because the page was slow but because the first `goto` of a shard paid
 * `next dev`'s on-demand compile — `/admin` alone measured 13.3s there. That
 * cost now belongs to `globalSetup` (e2e/helpers/warmup.ts), which is what
 * makes 20s a budget about the test rather than about the compiler.
 */
const TIMEOUT = isLocalTarget ? 20_000 : 300_000;

export default defineConfig({
  testDir: "./e2e",
  // The browser lane: everything that needs a server, a database or a browser.
  //
  // `e2e/unit` is excluded because it needs none of the three, and this config
  // cannot give it that. `webServer` and `globalSetup` below are `TestConfig`
  // options — there is no per-project form of either (playwright/types/
  // test.d.ts, 1.56.1) — so any test reachable from here boots `next dev` and
  // warms eight routes first. 164 pure-function tests were paying that, and
  // `--shard` was dividing by test count, so two of the three CI shards ran
  // nothing but those. See playwright.unit.config.ts, which runs them in 5.9s.
  testIgnore: "**/unit/**",
  forbidOnly: !!process.env.CI,
  // Runs once per shard, after `webServer` reports ready and before the first
  // test's clock starts. See e2e/helpers/warmup.ts for why the cost belongs
  // here rather than inside whichever test happened to run first.
  globalSetup: "./e2e/helpers/warmup.ts",
  // No retries, anywhere.
  //
  // Every test called flaky on this project has had a deterministic mechanism
  // once somebody looked: G-T2 was a 1440px drawer breakpoint, A1-T4 was the
  // test mutating the DOM it asserted on, N-T5 was a 5.2s route against a 5s
  // budget, and the gallery journey was a click Playwright reported as
  // successful that never navigated. In every one of them the retry is what
  // stopped anyone finding it — a green-on-retry run reports success and
  // throws the evidence away.
  //
  // docs/testing-strategy.md §7. If something starts failing intermittently,
  // that is the signal, not the noise.
  retries: 0,
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
