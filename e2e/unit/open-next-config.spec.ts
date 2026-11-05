import { expect, test } from "@playwright/test";

import config from "../../open-next.config";

/**
 * U-OPENNEXT — cache interception is never on while the revalidation queue
 * is not a real one.
 *
 * With no queue configured, `defineCloudflareConfig` resolves it to "dummy",
 * whose `send` throws `FatalError("Dummy queue is not implemented")`. Without
 * interception that is harmless: the server path (`revalidateIfRequired`)
 * wraps `queue.send` in a try/catch. With it, `cacheInterceptor.js` returns
 * `generateResult(...)` from inside a `try` *without awaiting it*, so when a
 * cached page is stale and `computeCacheControl` awaits the queue, the
 * rejection escapes the catch and the Worker answers 500. That took
 * production down in November 2026; the account is AGENTS.md, "Cache
 * interception turns every stale page into a 500".
 *
 * This is the cheapest guard that cannot be skipped: it reads the config the
 * build will actually use, runs in the unit lane on every PR, and needs no
 * server, no cache state and no revalidate-window wait. Seeing the failure
 * itself means deploying to staging and requesting a page after it has gone
 * stale — never a local `pnpm preview`, which builds against production D1.
 *
 * It always asserts the flag is a boolean, so if OpenNext moves it the test
 * fails instead of silently passing. It checks BOTH `default.override.queue`
 * and `middleware.override.queue`, because the interceptor uses the
 * middleware's. Only an override function counts as a real queue: "direct"
 * is rejected because its `send` also awaits and can reject through the same
 * unawaited path.
 *
 * Its limit: it checks configuration, not behaviour. `memoryQueue.send`
 * itself throws if the `WORKER_SELF_REFERENCE` binding is missing (present
 * in wrangler.jsonc today), so the staging stale-page check still applies.
 *
 * Deliberately silent about whether interception is on. It must keep passing
 * with interception off, and with it on plus a real queue.
 */

test.describe("U-OPENNEXT cache interception needs a real queue", () => {
  test("U-OPENNEXT-1: interception on implies a non-dummy revalidation queue", () => {
    // Asserted every run, so a pass is never a pass by not looking: if OpenNext
    // moves this flag, `?.` would read undefined and the guard below would
    // never fire again.
    const interception = config.dangerous?.enableCacheInterception;
    expect(
      typeof interception,
      "config.dangerous.enableCacheInterception is not a boolean: OpenNext " +
        "has moved the flag, and this guard no longer reads what the build reads",
    ).toBe("boolean");

    // The interceptor runs in the routing layer, whose queue is the
    // middleware's (`adapters/middleware.js` resolves
    // `middleware.override.queue`); `default.override.queue` is the server's.
    // defineCloudflareConfig fills both from one input today. A real queue is
    // an override function (memoryQueue, doQueue); "direct" is OpenNext's
    // dev queue and "dummy" throws.
    const middleware = config.middleware;
    const queues = {
      "default.override.queue": config.default?.override?.queue,
      "middleware.override.queue":
        middleware && "override" in middleware ? middleware.override?.queue : undefined,
    };
    const notReal = Object.entries(queues)
      .filter(([, queue]) => typeof queue !== "function")
      .map(([path, queue]) => `${path} = ${JSON.stringify(queue ?? null)}`);

    expect(
      interception ? notReal : [],
      `open-next.config.ts enables cache interception without a real ` +
        `revalidation queue. Interception with the dummy (or direct) queue can ` +
        `return HTTP 500 for every stale page (the queue's send rejects outside ` +
        `the interceptor's try/catch); this took production down in 2026-11, ` +
        `see PR #210. Configure OpenNext's memoryQueue or doQueue and verify ` +
        `a stale page on staging before it reaches production.`,
    ).toEqual([]);
  });
});
