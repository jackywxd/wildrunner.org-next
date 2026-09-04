import { createRequire } from "node:module";
import { join, sep } from "node:path";

import { expect, test } from "@playwright/test";

import { LOCALIZED_SEGMENTS, defaultLocaleRewrites } from "@/lib/i18n/rewrites";

/**
 * U-REWRITE — the unprefixed addresses reach the default language's pages.
 *
 * WHY THIS IS NOT A BROWSER TEST. It cannot be one: `next dev` rewrites
 * `/posts` correctly with either version of this config, and the deployed
 * Worker does not. The difference is `handleRewrites` in @opennextjs/aws
 * (`dist/core/routing/matcher.js`), which interpolates the destination only
 * when the source captured a parameter:
 *
 *     const isUsingParams = Object.keys(params).length > 0;
 *     rewrittenPath = isUsingParams ? compile(destination)(params) : pathname;
 *
 * `path-to-regexp` returns `{}` for a `*` repeat that captured nothing, so
 * `/posts` against `/posts/:path*` shipped the destination *string*
 * `/zh-hant/posts/:path*`, which matches no route — every index page on
 * staging answered 404 while the home page and every article worked. The
 * whole browser suite was green throughout, and could only ever have been.
 *
 * So this replays that computation over the real list. `path-to-regexp` is
 * loaded from the adapter's own tree rather than declared as a dependency
 * here: the assertion is about the copy that will serve the site, and a
 * second copy at a version of its own would quietly stop being that.
 */
const fromAdapter = (() => {
  const fromProject = createRequire(join(process.cwd(), "index.js"));
  const entry = fromProject.resolve("@opennextjs/cloudflare");
  const scope = `${sep}@opennextjs${sep}`;
  const packages = entry.slice(0, entry.lastIndexOf(scope) + scope.length);
  return createRequire(join(packages, "aws", "package.json"));
})();

type Params = Record<string, string | string[]>;
type PathToRegexp = {
  match: (source: string) => (path: string) => false | { params: Params };
  compile: (destination: string) => (params: Params) => string;
};

const { compile, match } = fromAdapter("path-to-regexp") as PathToRegexp;

const REWRITES = defaultLocaleRewrites("zh-hant");

/** `handleRewrites`, reduced to the path it produces. */
function rewrite(path: string): string | null {
  const found = REWRITES.find((route) => match(route.source)(path) !== false);
  if (!found) return null;
  const matched = match(found.source)(path);
  const params = matched === false ? {} : matched.params;
  return Object.keys(params).length > 0
    ? compile(found.destination)(params)
    : found.destination;
}

test.describe("U-REWRITE the unprefixed addresses", () => {
  test("U-REWRITE-1: every index page reaches the default language", () => {
    // The ten that 404'd. `/` is here too because it is the one address that
    // kept working, and a fix that broke it would be worse than the bug.
    expect(rewrite("/")).toBe("/zh-hant");
    for (const segment of LOCALIZED_SEGMENTS) {
      expect(rewrite(`/${segment}`), `/${segment} did not reach zh-hant`).toBe(
        `/zh-hant/${segment}`,
      );
    }
  });

  test("U-REWRITE-2: paths below an index carry their remainder", () => {
    expect(rewrite("/posts/2026/my-race")).toBe("/zh-hant/posts/2026/my-race");
    expect(rewrite("/members/login")).toBe("/zh-hant/members/login");
    expect(rewrite("/gallery/m/1234")).toBe("/zh-hant/gallery/m/1234");
    expect(rewrite("/races/utmb/2026")).toBe("/zh-hant/races/utmb/2026");
  });

  test("U-REWRITE-3: nothing else is rewritten", () => {
    // `beforeFiles` runs before OpenNext looks for a static asset
    // (`routingHandler.js`), so anything matched here never reaches the file
    // it names. Payload owns the first two; the rest are files.
    for (const path of [
      "/api/media",
      "/admin",
      "/print/posts/a-slug",
      "/icon.svg",
      "/fonts/NotoSansTC-Regular.woff2",
      "/_next/static/chunks/main.js",
    ]) {
      expect(rewrite(path), `${path} was rewritten`).toBeNull();
    }
  });
});
