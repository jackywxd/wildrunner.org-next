import { defineConfig } from "@playwright/test";

/**
 * The unit lane.
 *
 * A SECOND CONFIG FILE, NOT A SECOND PROJECT, and that is forced rather than
 * chosen: `webServer` and `globalSetup` are declared on `TestConfig` only —
 * never on `TestProject` (checked in playwright/types/test.d.ts, 1.56.1). A
 * project cannot opt out of them, so a project-level split would still boot
 * `next dev` and still warm eight routes before running a pure function.
 *
 * That is what it did. `--shard` divides by *test count*, and this suite's
 * count is anti-correlated with its cost: 164 of 206 tests were pure
 * functions at 2-20ms each, while 30 browser journeys cost 3.2-15.9s each.
 * Shards 2 and 3 therefore drew 67 and 65 unit tests and nothing else, and
 * each paid a container, an install, `payload migrate`, ~2m30s of seeding and
 * a dev-server boot to execute about a third of a second of assertions. Shard
 * 1 drew every journey and every corpus test and took 6.3 minutes alone.
 *
 * Measured here, with no server and no warmup: 164 passed in 5.9s.
 *
 * So this config carries nothing the level does not need. No `webServer`, no
 * `globalSetup`, no browser — `docs/testing-strategy.md` §4 already says a
 * unit test has no clock, no network and no database, and this is that rule
 * expressed as infrastructure instead of as prose. `fullyParallel` is safe
 * for exactly the same reason: with no D1 and no server there is nothing for
 * two workers to race over, which is the whole argument `workers: 1` makes in
 * the other config.
 */
export default defineConfig({
  testDir: "./e2e/unit",
  forbidOnly: !!process.env.CI,
  // §7. The same reasoning as the main config: a green-on-retry run reports
  // success and throws the evidence away.
  retries: 0,
  fullyParallel: true,
  workers: "100%",
  // A unit test that takes ten seconds is not a unit test. The measured max
  // in this lane is 20ms, so this is a tripwire for a spec that has quietly
  // acquired a network call, not a budget anything is expected to approach.
  timeout: 10_000,
  reporter: [["list"]],
});
