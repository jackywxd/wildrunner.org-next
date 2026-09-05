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
 * Every route the browser lane reaches, plus `/admin`, whose first compile is
 * the largest of the lot.
 *
 * A DYNAMIC SEGMENT IS ITS OWN COMPILATION UNIT. This list used to say that
 * "sub-pages (`/posts/<slug>`) share a compiled route with their index, so
 * listing one of each is enough". They do not: `posts/page.tsx` and
 * `posts/[...slug]/page.tsx` are separate files and compile separately, and
 * the same holds for every pair below. Warming only the index left every
 * detail route's first compile to land inside whichever test reached it
 * first, which is the cost this file exists to move out of test budgets.
 *
 * It went unnoticed while all 42 browser tests ran in one shard: by the time
 * an upload journey ran, some earlier test had usually paid the compile. Once
 * the lane was split three ways that stopped being true, and `P-PHOTO` — which
 * reaches `/members/login`, `/members/media` and `/races/<key>/<year>`, none
 * of them warmed — blew its 20s budget on CI while passing locally.
 *
 * The placeholder params below do not need to resolve. Next compiles the
 * route to answer the request at all, so a 404 warms it exactly as well as a
 * hit; `fetch` failures here are already tolerated and logged rather than
 * fatal. Member routes redirect when signed out and that is fine for the same
 * reason: there is no middleware, so the redirect comes from the route itself
 * having been compiled and run.
 */
const ROUTES = [
  "/",
  "/about",
  "/admin",
  "/posts",
  "/posts/warmup-not-a-real-post",
  // Its own compilation unit, and not covered by `/posts/...`: the print
  // route lives outside `(site)` under a second root layout of its own. The
  // API route beside it compiles separately again.
  "/print/posts/warmup-not-a-real-post",
  "/api/print/posts/warmup-not-a-real-post",
  "/api/print/riders/warmup-not-a-real-rider/timeline",
  "/gallery",
  "/gallery/warmup-not-a-real-gallery",
  "/gallery/m/999999999",
  "/races",
  "/races/warmup-not-a-real-event/2026",
  "/riders",
  "/riders/timeline",
  "/riders/warmup-not-a-real-rider",
  "/riders/warmup-not-a-real-rider/timeline",
  "/members",
  "/members/login",
  "/members/media",
  "/members/races",
  "/members/profile",
  "/members/posts",
  "/members/posts/new",
  "/members/posts/import",
  "/members/posts/0",
  // The two share-card Route Handlers, which are what WeChat and 小紅書
  // actually fetch. They live under `(site)` rather than `(public)` and each
  // is a single `[...slug]/route.tsx`, so one placeholder warms every card
  // shape it serves. Measured here, cold: `/wx/race/<key>/<year>` took
  // **7.7s** against 0.29s warm, inside `V-SHARE-T3`, whose whole budget is
  // 20s and which also loads /riders/timeline and a race edition (6.3s cold
  // itself) before it gets there. That is what timed it out on CI — the same
  // shape as `P-PHOTO` above, one route family later.
  "/wx/warmup-not-a-real-card",
  "/share/warmup-not-a-real-card",
  // The app-root `not-found.tsx`, which is its own compilation unit and the
  // only route reached by an address that matches nothing. Every entry above
  // warms the `(public)` boundary instead, so without this line the one
  // shape of 404 that has no route to hang off would compile inside whichever
  // test asked for it first.
  "/warmup-not-a-real-route",
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
