import { test as base, expect } from "@playwright/test";

/**
 * `test` for any spec that drives a browser.
 *
 * The suite had 257 tests and exactly one of them looked at the console. That
 * is how a hand-written `<html>` wrapper in `src/app/(payload)/layout.tsx`
 * nested a second `<html>` inside `<body>` on *every* admin page — React
 * logged "cannot be a child of <body>", remounted html and body, failed
 * hydration and rebuilt the whole admin tree client-side — while 250 tests
 * stayed green. Nothing asserted on it, so nothing saw it.
 *
 * Assertions that ask "is this text on the page" cannot see a page that is
 * screaming. This fixture makes the browser's own complaints fail the test
 * that provoked them, which is the only way they get attributed to a change
 * instead of scrolling past in a log nobody opens.
 *
 * API-only specs must keep importing from `@playwright/test`: the guard is an
 * automatic fixture and depends on `page`, so importing `test` from here would
 * launch a browser for a spec that only needs `request`.
 */

/**
 * Noise that is not the app's fault and cannot be fixed from this repo.
 *
 * Keep this list short and each entry justified. Anything added here is a
 * class of error the suite can no longer see, so the bar is "the app cannot
 * cause it and cannot stop it" — not "this is currently failing".
 */
const IGNORED_PATTERNS: { pattern: RegExp; why: string }[] = [
  {
    pattern: /Failed to load resource.*favicon/i,
    why: "no favicon is served in dev; not app behaviour",
  },
  {
    pattern: /Download the React DevTools/i,
    why: "React's own development advertisement",
  },
  {
    pattern: /\[Fast Refresh\]|webpack-hmr|__nextjs_original-stack-frame/i,
    why: "dev-server HMR chatter, absent from any deployed build",
  },
  {
    // 4xx only. Several specs request a missing post, a duplicate slug or an
    // over-quota upload on purpose and assert the status themselves, so the
    // browser's echo of it is redundant. 5xx is deliberately NOT here: the
    // server breaking is never something a test asked for, and /og returning
    // 500 is exactly the kind of thing this guard should keep failing on.
    pattern: /Failed to load resource: the server responded with a status of 4\d\d/,
    why: "an expected 4xx the spec asserts on directly; 5xx still fails",
  },
  {
    // src/app/(site)/layout.tsx must inline two scripts in <head>: the
    // esbuild `keepNames` shim and the anti-FOUC theme seed. Both have to run
    // before first paint, which rules out next/script, and React 19 warns
    // about the pattern itself rather than about anything going wrong — the
    // scripts do execute on the server-rendered HTML, which is all they need.
    pattern: /Encountered a script tag while rendering React component/,
    why: "anti-FOUC and keepNames shims must be inline in <head>; the warning is about the pattern, not a failure",
  },
];

function isIgnored(text: string) {
  return IGNORED_PATTERNS.some(({ pattern }) => pattern.test(text));
}

export const test = base.extend<{ failOnBrowserErrors: void }>({
  failOnBrowserErrors: [
    async ({ page }, use, testInfo) => {
      const problems: string[] = [];

      // An uncaught exception in page code. Never acceptable — if a test
      // provokes one deliberately it should assert on it and this guard is
      // the wrong tool for that spec.
      page.on("pageerror", (error) => {
        problems.push(`pageerror: ${error.message}`);
      });

      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (isIgnored(text)) return;
        problems.push(`console.error: ${text}`);
      });

      await use();

      if (problems.length === 0) return;

      // Attach before asserting: on failure the report should carry every
      // message, not just the first line of the assertion diff.
      await testInfo.attach("browser-errors.txt", {
        body: problems.join("\n\n"),
        contentType: "text/plain",
      });

      expect(
        problems,
        `The browser reported ${problems.length} error(s) during this test. ` +
          `A page that logs errors is not a page that works, even when the ` +
          `assertions pass. See the browser-errors.txt attachment.`,
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
