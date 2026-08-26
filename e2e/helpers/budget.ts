import { isLocalTarget } from "../../playwright.config";

/**
 * How long one step may take, given what it is talking to.
 *
 * `playwright.config.ts` already makes this distinction for the whole-test
 * budget — 20s against a local dev server, 300s against a deployed origin —
 * and says why: the same journey that takes under a second locally spends
 * tens of seconds when every write is a Payload request to a Worker talking
 * to remote D1. The per-step budgets inside the specs were left at the local
 * number, so a test with four and a half minutes to spare could still be
 * killed by one step judged against a dev server's clock.
 *
 * That is what happened. `R-REPORT` on the 2026-08-26 staging deploy:
 * publishing returned 200 in **19,487ms** against a hardcoded 20,000ms
 * `toHaveURL`. The write succeeded and the router did navigate — the
 * assertion simply ran out of budget half a second before it landed. The
 * rest of that journey's writes, same run:
 *
 *   login 3.6s · create draft 4.5s · race record 7.5s
 *   save draft 10.2s · publish 19.5s · delete 9.7s
 *
 * Locally the same calls are sub-second. The factor is 5, which clears that
 * measured 19.5s with room and still leaves a hung step failing at a fifth
 * of the 300s test budget rather than consuming all of it — a step that
 * blows this is still reported as that step, not as a test that timed out
 * somewhere.
 *
 * Pass the number that is right for a dev server; this scales it.
 */
export const REMOTE_FACTOR = 5;

export function budget(local: number): number {
  return isLocalTarget ? local : local * REMOTE_FACTOR;
}
