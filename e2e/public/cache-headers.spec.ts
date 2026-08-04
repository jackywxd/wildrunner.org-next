import { expect, test } from "@playwright/test";

import { BASE_URL } from "../../playwright.config";

/**
 * Cache-Control is load-bearing here, and it has been got wrong twice.
 *
 * The rules live in one ordered list in `next.config.ts` where later entries
 * win, so a route is protected only if some rule after the broad `/:path*`
 * default names it. `/api/*` was added after a shared cache could have handed
 * one member another's media library; `/admin/*` was added after the
 * logged-out login screen was cached for an hour under /admin and re-served
 * to an admin who had just signed in. Both were invisible in the UI until
 * somebody hit them.
 *
 * ---
 *
 * These only run against a deployed origin, and that is not a convenience.
 * `next dev` replaces Cache-Control on every page response with
 * `no-store, must-revalidate` regardless of what `headers()` returns — so
 * against localhost every assertion below would either fail for the wrong
 * reason or, worse, pass identically with the config change reverted. A test
 * that cannot tell the fixed state from the broken one is not a test.
 *
 * So: run the suite against a deployed origin to exercise this file.
 *
 *   PLAYWRIGHT_BASE_URL=https://wildrunner-org-next-staging.small-tooth-cc10.workers.dev \
 *     pnpm test:e2e e2e/public/cache-headers.spec.ts
 *
 * The PR gate (e2e.yml) targets localhost and skips this describe. The
 * deploy pipeline does not: deploy.yml's `verify-staging` job runs the whole
 * suite with PLAYWRIGHT_BASE_URL set to the staging URL, and the production
 * job depends on it. So these do gate a release — just not a pull request.
 */

const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(
  BASE_URL,
);

/** Never stored by any cache: a session decides what the body contains. */
const PRIVATE_PATHS = [
  "/admin",
  "/admin/login",
  "/admin/collections/posts",
  "/members",
  "/members/login",
  "/members/media",
  "/members/profile",
  "/api/race-schedule",
  "/api/users/me",
];

/** Public, but must still be revalidated rather than reused blind. */
const PUBLIC_PATHS = ["/", "/about", "/posts", "/gallery", "/races", "/riders"];

test.describe("H cache headers", () => {
  test.skip(
    IS_LOCAL,
    "next dev overrides page Cache-Control; only a deployed origin shows the real config",
  );

  for (const path of PRIVATE_PATHS) {
    test(`H-T1: ${path} is never stored by any cache`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      const cacheControl = res.headers()["cache-control"] ?? "";

      expect(cacheControl).toContain("no-store");
      // `private` and the absence of a reusable lifetime are separate
      // guarantees: a shared cache that ignores no-store must not then find
      // a positive max-age to act on.
      expect(cacheControl).toContain("private");
      expect(cacheControl).not.toContain("public");
      expect(cacheControl).not.toMatch(/max-age=[1-9]/);
    });
  }

  for (const path of PUBLIC_PATHS) {
    test(`H-T2: ${path} is revalidated, not reused`, async ({ request }) => {
      const res = await request.get(path);
      const cacheControl = res.headers()["cache-control"] ?? "";

      // A positive max-age is the specific defect. Next serves the HTML
      // document, the RSC payload a Link click fetches, and the much smaller
      // payload a Link *prefetch* fetches all at this one URL, and Vary does
      // not include RSC — so a cache allowed to reuse without revalidating
      // cannot tell those three bodies apart.
      expect(cacheControl).not.toMatch(/max-age=[1-9]/);
      expect(cacheControl).toContain("must-revalidate");
    });
  }

  test("H-T3: fingerprinted assets keep their immutable year", async ({
    request,
  }) => {
    // The counterpart to H-T2: the fix must not have swept up the one class
    // of response that genuinely should never be revalidated. These come from
    // Workers Assets via public/_headers rather than next.config, and this
    // asserts that separation still holds.
    const html = await (await request.get("/races")).text();
    const asset = html.match(/\/_next\/static\/[^"']+\.js/)?.[0];
    expect(asset, "no fingerprinted script found on /races").toBeTruthy();

    const res = await request.get(asset!);
    expect(res.headers()["cache-control"] ?? "").toContain("immutable");
  });
});
