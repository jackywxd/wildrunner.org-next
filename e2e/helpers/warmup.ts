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

/**
 * How many routes are compiled at once.
 *
 * ONE, BOUGHT AT A KNOWN PRICE. Serial warmup was measured at 167.2s for the
 * 29 routes below on a cold `.next`, and 139s on a CI runner — time every
 * shard pays before its first test starts. Four lanes were chosen for exactly
 * that reason and held for months.
 *
 * Re-measured on the change to one. Locally, same machine, warm `.next`:
 * 64.3s serial against 20.9-26.9s on four lanes. On CI, the two runs either
 * side of this change:
 *
 *   four lanes   warmup  84.1s    e2e jobs 388-458s
 *   one lane     warmup 130.4s    e2e jobs 354-562s
 *
 * **+46s of warmup, and about a tenth of each shard's wall clock.** Much less
 * than the 139s the paragraph above feared, because that figure was a cold
 * `.next` and CI restores one. That is the bill; it is worth paying only while
 * it buys something.
 *
 * AND WHETHER IT DOES IS NOT YET ESTABLISHED. The run immediately before this
 * change was also green. One green run proves nothing about a fault that was
 * always green on re-run — the honest test is several runs, watched. If they
 * stay clean, keep it; if the parse errors come back, raise the lanes and stop
 * paying for nothing.
 *
 * WHAT CHANGED IS THAT THE COST OF CONCURRENCY GOT A NAME. `next dev` updates
 * `.next/dev/prerender-manifest.json` with an unsynchronised read-modify-write
 * — `readFile`, `JSON.parse`, mutate, `writeFile`, with `await` between every
 * step and no lock (`next/dist/server/dev/next-dev-server.js`, ~660-690). It
 * runs once per dynamic route whose `generateStaticParams` resolves, and the
 * write is a plain `fs.promises.writeFile`, not the `writeFileAtomic` Next
 * ships in `next/dist/lib/fs/write-atomic.js` and uses for other manifests.
 *
 * Two of those overlapping leave the file as one writer's valid JSON followed
 * by a longer writer's tail, and the dev server's own `JSON.parse` of it then
 * throws `Unexpected non-whitespace character after JSON at position N` —
 * where N is the shorter write's length. That kills whatever request is in
 * flight, `/api/users/login` most often, and 20-30 unrelated specs in the
 * shard fail with `fixture setup could not sign in`. Measured on PR #170:
 * 192-316 copies of that error per shard, four of five shards red, green on
 * re-run. Every site route lives under `[lang]` and is therefore dynamic, so
 * every route this file warms takes that path.
 *
 * Warming routes concurrently is precisely what overlaps those writes, so the
 * queue is serial. It narrows the window rather than closing it — requests
 * after warmup still compile — and it does not touch the deployed app, which
 * is a built Worker with no on-demand compilation and has never shown this.
 *
 * The older reason for keeping this number low still holds and points the
 * same way: AGENTS.md records that `next dev` forks a fresh child per dynamic
 * route to ask for `generateStaticParams`, each opening its own miniflare over
 * the same local SQLite file — the contention behind `database is locked` and
 * a red `V-RACEALBUM-T1`.
 *
 * If the wall-clock cost proves worse than the flake, raise it back; the
 * numbers above are what to weigh it against.
 */
const LANES = 1;

export default async function warmup() {
  // A deployed origin serves a built app: there is nothing to compile, and
  // hitting it here would only add requests to someone else's server.
  if (!isLocalTarget) return;

  const started = Date.now();
  const queue = [...ROUTES];

  const lane = async () => {
    for (let route = queue.shift(); route; route = queue.shift()) {
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
  };

  // `shift()` off a shared array rather than a chunked split: the routes
  // differ by an order of magnitude (`/admin` 13.1s against `/about` 0.3s on
  // CI), so fixed chunks would leave three lanes finished and one still
  // compiling the admin panel.
  await Promise.all(Array.from({ length: LANES }, lane));

  console.log(`[warmup] ${ROUTES.length} routes in ${Date.now() - started}ms`);
}
