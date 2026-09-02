import {
  test as base,
  expect,
  request as playwrightRequest,
} from "@playwright/test";

import { apiHeaders, withRetries } from "./request";

/**
 * `test` with a `request` fixture that survives the connection dying.
 *
 * Playwright's own `request` fixture hands out a context built on the shared
 * keep-alive agents, so every spec using `{ request }` inherits the stale
 * socket problem that e2e/helpers/request.ts describes at length. Replacing
 * the fixture is what makes the fix reach those specs without editing the 100
 * call sites inside them, and — more to the point — without the next spec
 * having to remember anything.
 *
 * SEPARATE FROM helpers/test.ts ON PURPOSE. The console guard there is an
 * automatic fixture that depends on `page`, so importing it into a spec that
 * only needs `request` would launch a browser for nothing. That is why
 * docs/testing-strategy.md tells API-only specs to import from
 * `@playwright/test` directly. This module is that same plain runner with one
 * fixture replaced: no `page`, no browser, no guard. `helpers/test.ts` builds
 * on it, so a browser spec gets both.
 *
 * The fixture creates the context rather than reconfiguring the built-in one,
 * because `extraHTTPHeaders` on a context is fixed at construction. That
 * means repeating `Origin` here — see `apiHeaders`, and note that Payload
 * silently authenticates as nobody without it.
 */
// The array form, matching helpers/test.ts: with the function written
// directly as the property value, eslint's react-hooks rule reads Playwright's
// `use` callback as a React hook called in a function named `request`.
export const apiTest = base.extend({
  request: [
    async ({ baseURL }, use) => {
      const context = await playwrightRequest.newContext({
        baseURL,
        extraHTTPHeaders: apiHeaders(baseURL),
      });
      await use(withRetries(context));
      await context.dispose();
    },
    { scope: "test" },
  ],
});

export { expect };
