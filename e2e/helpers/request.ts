import type { APIRequestContext, APIResponse } from "@playwright/test";

/**
 * How every API request context in this suite is built, and why it survives
 * the connection dying underneath it.
 *
 * THE FAILURE THIS EXISTS FOR. Five CI failures across #110, #112, #115 and
 * #118 were the same thing wearing different names: a transport-level reset
 * on an API call, in five different tests, on five different call sites, on
 * GET and POST and DELETE, against both the local dev server and staging.
 * The most recent (#118's own gate) was
 *
 *   Q1 ... apiRequestContext.get: read ECONNRESET
 *          → GET http://localhost:3000/api/race-editions/78?depth=0
 *
 * with the dev server logging nothing at all in that second — no crash, no
 * restart, no compile. A server that errors says so; one that has quietly
 * closed a socket does not.
 *
 * WHAT IS ACTUALLY GOING ON. Playwright sends every API request through two
 * module-level agents built with `keepAlive: true`
 * (playwright-core/lib/server/utils/happyEyeballs.js, used at fetch.js:227).
 * They are singletons shared by every context in the process, there is no
 * public option to turn pooling off, and a socket goes back in the pool after
 * each response. Meanwhile the specs all have the same shape: build a context,
 * sign in, then do half a minute of browser work, then make the next API call
 * on that context. Q1's admin context signed in at 00:10:23.8 and its next
 * call went out at 00:10:30.3 — 6.5 seconds idle, against a Node server whose
 * `keepAliveTimeout` defaults to 5000ms and which nothing here raises. Every
 * one of the five failures is the first API call after such a gap.
 *
 * Honesty about what is proven: the shape above fits all five, and the fix
 * below removes the reuse. But a controlled reproduction — a Node server with
 * a compressed keep-alive window, 240 trials sweeping the reap boundary —
 * produced zero resets, because an unloaded server's FIN is processed by the
 * client long before the next request. So the precise interleave on a loaded
 * dev server is inferred, not demonstrated, and both layers below are kept
 * for that reason rather than only the tidier one.
 *
 * THE FIX IS THE RETRY, AND ONLY THE RETRY. `withRetries` wraps the context so
 * a transport error is retried wherever it happens.
 *
 * IT WAS TWO LAYERS FOR ONE DEPLOY, AND THE SECOND ONE HAD TO GO. `apiHeaders`
 * also sent `Connection: close`, so that no socket was reused and the race
 * above could not arise at all. It did what it claimed — five requests share
 * one socket by default and used five distinct ones with the header — and
 * against staging it broke something worse.
 *
 * Deploy run 33577524228, the first staging run to carry it: 13 failed, 37
 * passed, and the failures were not transport errors at all. They were the
 * Worker answering
 *
 *   500 {"message":"There was an error initializing Payload"}
 *
 * for the first ninety seconds — `Failed to create admin user`, `race-events
 * is not readable`, then `fixture setup could not sign in` nine times — after
 * which every remaining test passed.
 *
 * That PR changed nothing but files under e2e/, so the deployed Worker was
 * functionally identical to the one that had just passed 58/58 in run 111
 * starting 45 seconds after its own deploy. The one thing that differed was
 * this header. With keep-alive a whole run rides a handful of connections and
 * therefore a handful of already-warm isolates; with a fresh connection per
 * call each one can land on a cold isolate, and a cold start here boots
 * Payload — which acquires the Cloudflare context in a top-level await and is
 * anything but cheap. The failures clustering in the first ninety seconds and
 * then stopping is what warming up looks like.
 *
 * Not proven, and worth saying so: `workers: 1` means the suite is sequential,
 * so this is not a thundering herd, and Cloudflare's isolate reuse is not
 * something this repo can observe. But it was the only behavioural change
 * against staging, it correlates exactly, and it was already the half that
 * could never be shown to fix anything. The retry is the half that was
 * measured to work.
 *
 * WHY THE SECOND LAYER IS A WRAPPER AND NOT A HABIT. `withTransportRetry` has
 * existed since #112 and was applied by hand, one call site per incident —
 * #112 wrapped the call that had just failed, #115 wrapped the next one, and
 * the count at the time of writing was 22 protected calls against 100 raw
 * ones. Each fix covered exactly the site that had already gone red. A retry
 * nobody has to remember is the only version of this that stops the next
 * incident rather than the last one.
 *
 * This is not the "retries hide flakiness" that docs/testing-strategy.md §7
 * forbids, and the distinction is worth being precise about: `retries` in
 * playwright.config.ts re-runs a whole test and would hide a real assertion
 * failure. This re-sends one HTTP request that never reached the application,
 * and only when the connection itself failed. Nothing about what the test
 * asserts is retried.
 */

/**
 * Connection-level failures only.
 *
 * A Playwright *timeout* is deliberately absent. A reset means the request did
 * not arrive; a timeout usually means the server has it and is still working,
 * so re-sending would double a write that is about to land. The old version
 * retried every thrown error and had this hole.
 */
const TRANSPORT_ERROR =
  /ECONNRESET|ECONNREFUSED|ECONNABORTED|EPIPE|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|socket hang up|socket disconnected|network error/i;

export function isTransportError(error: unknown): boolean {
  return error instanceof Error && TRANSPORT_ERROR.test(error.message);
}

/**
 * Headers every API context needs.
 *
 * `Origin` because Payload ignores the auth cookie on a request carrying
 * neither `Origin` nor `Sec-Fetch-Site` — it reads that as a non-browser
 * client and authenticates it as nobody (CSRF protection, active because
 * `serverURL` is set). Contexts made with `request.newContext()` do not
 * inherit `use.extraHTTPHeaders`, so it has to be repeated here.
 *
 * It carried `Connection: close` for one deploy; the header comment above
 * records what that cost and why it is gone. Adding anything here again means
 * changing how every API request reaches a deployed Worker, which is a bigger
 * blast radius than it looks.
 */
export function apiHeaders(baseURL: string | undefined): Record<string, string> {
  return baseURL ? { Origin: baseURL } : {};
}

/**
 * Retry when the connection dies before a response arrives.
 *
 * Still exported: `page.request` is the browser context's own request object
 * and is not built here, so the call sites that reach for it keep wrapping by
 * hand.
 */
export async function withTransportRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Anything that is not the connection failing is the answer, not an
      // accident. Rethrowing immediately keeps a genuine error's message and
      // its timing intact instead of burying it under two more attempts.
      if (attempt === 3 || !isTransportError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error(`withTransportRetry: unreachable (${label})`);
}

export async function getWithRetry(
  request: APIRequestContext,
  url: string,
): Promise<APIResponse> {
  return withTransportRetry(url, () => request.get(url));
}

/** The verbs that issue a request. Everything else on the context is passed through. */
const REQUEST_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "fetch"]);

/**
 * A context whose requests survive the connection failing.
 *
 * POST is retried along with the rest, and that is a deliberate trade rather
 * than an oversight: 66 of the 100 unprotected calls are POSTs, so excluding
 * them would leave the majority of the suite exactly as exposed as it is now.
 * The risk is the case where the server processed a create and only the
 * response was lost, which a retry would duplicate. Under the mechanism
 * described above the request never reaches the application at all — it is
 * written to a socket the server has already closed — so a retry is the
 * correct recovery. A duplicate fixture row is also bounded and visible:
 * cleanup reports rows the ledger does not claim.
 *
 * Every method is invoked against `target`, never against the proxy. Playwright's
 * context is a class with private fields, and calling one with `this` bound to
 * a Proxy throws on the field access rather than doing anything useful.
 */
export function withRetries(context: APIRequestContext): APIRequestContext {
  return new Proxy(context, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;

      const method = value as (...args: unknown[]) => unknown;
      if (typeof property !== "string" || !REQUEST_METHODS.has(property)) {
        return method.bind(target);
      }

      return (...args: unknown[]) =>
        withTransportRetry(`${property} ${String(args[0])}`, () =>
          method.apply(target, args) as Promise<APIResponse>,
        );
    },
  });
}
