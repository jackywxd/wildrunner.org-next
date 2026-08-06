/**
 * Compile every route the suite navigates, before any test's clock starts.
 *
 * `next dev` compiles a route the first time it is requested. On a warm
 * laptop that is invisible; on a cold CI runner the first `goto` of a shard
 * pays the whole cost, and it landed on whichever test happened to be first.
 * P0-T2 ("public home responds") failed at 20s on PR #28 for exactly this —
 * a test named for the home page reporting a compiler's start-up time.
 *
 * Raising the per-test timeout would have hidden it: every test's budget
 * would grow to cover a cost that belongs to none of them, and the real
 * signal — "this page got slow" — would have nowhere left to show. Paying it
 * once, here, keeps each test's budget about that test.
 *
 * This is not a retry. Nothing is attempted twice; a route that fails to
 * compile still fails, and it fails here with its own name attached rather
 * than as a timeout inside an unrelated spec.
 *
 * The timings are printed because a warmup that silently did nothing looks
 * exactly like a warmup that worked. The CI log shows what each route
 * actually cost, so the claim in this comment stays checkable.
 */
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const isLocalTarget =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE_URL);

/**
 * Every route a spec reaches by `goto`, plus `/admin` and `/members`, whose
 * first compile is the largest of the lot. Sub-pages (`/posts/<slug>`) share
 * a compiled route with their index, so listing one of each is enough.
 */
const ROUTES = [
  "/",
  "/posts",
  "/gallery",
  "/races",
  "/riders",
  "/about",
  "/members",
  "/admin",
];

export default async function warmup() {
  // A deployed origin serves a built app: there is nothing to compile, and
  // hitting it here would only add requests to someone else's server.
  if (!isLocalTarget) return;

  const started = Date.now();
  for (const route of ROUTES) {
    const at = Date.now();
    try {
      const response = await fetch(`${BASE_URL}${route}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(120_000),
      });
      console.log(
        `[warmup] ${route} → ${response.status} in ${Date.now() - at}ms`,
      );
    } catch (error) {
      // Not fatal. A route that cannot be reached is a finding for the spec
      // that asserts about it, which will say so in its own terms; failing
      // the whole run here would replace that with a stack trace from a
      // helper, and would also break the suite on any route a future branch
      // has legitimately removed.
      console.log(
        `[warmup] ${route} → unreachable after ${Date.now() - at}ms: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  console.log(`[warmup] ${ROUTES.length} routes in ${Date.now() - started}ms`);
}
