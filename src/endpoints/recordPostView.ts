import type { Endpoint } from "payload";
import { APIError } from "payload";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { recordPostView } from "@/lib/posts/views";

/**
 * One read of one article, reported by the reader's browser.
 *
 * WHY A BEACON AND NOT A SERVER-SIDE COUNTER. `/[lang]/(site)/(public)/posts/
 * [...slug]` is prerendered into the R2 incremental cache and invalidated
 * per-slug by `revalidatePosts`. A cache hit serves bytes without running any
 * application code, so a `count++` in the page component would fire once per
 * cache miss — roughly once per edit — rather than once per reader. The number
 * would not be slightly low; it would be unrelated.
 *
 * DELIBERATELY ANONYMOUS. Readers are not signed in; requiring a session would
 * count only the club's own members reading each other, which is the opposite
 * of the question being asked. A session, when there is one, is read only to
 * leave out the owner's own reads (`recordPostView`). What keeps that safe is in
 * `recordPostView`: the id is checked against `posts` inside the same
 * statement, so an id that is not a published article writes nothing and the
 * table cannot be grown from outside.
 *
 * NO RATE LIMIT HERE, and that is a decision rather than an omission.
 * `checkAiRateLimit` keys on `req.user.id`, which does not exist for a visitor;
 * limiting an anonymous caller means storing something about them, and the
 * per-viewer identifier that would take is the one thing this feature has no
 * other reason to collect. So the de-duplication that matters — a reader
 * refreshing — is done in the browser (`ViewBeacon`, one report per article
 * per session), and what is left unprotected is somebody deliberately looping
 * the endpoint. On a club site that inflates a number the club shows to its
 * own authors. If it ever matters, the fix is a keyed table like
 * `ai_rate_limits`, not a change here.
 *
 * ALWAYS 204, INCLUDING ON REFUSAL. The reader has nothing to do with the
 * answer — the beacon ignores it — and distinguishing "counted" from "that is
 * not a published article" would turn this into a way to enumerate which ids
 * exist.
 *
 * A COLLECTION ENDPOINT, NOT A CONFIG-LEVEL ONE, and the path here is
 * `/:id/view` rather than `/posts/:id/view` because of it. Payload routes on
 * the first path segment: if it names a collection, it swaps to that
 * collection's endpoint list and strips the slug before matching
 * (`payload/dist/utilities/handleEndpoints.js`, ~135-144):
 *
 *     let endpoints = config.endpoints
 *     if (collection) {
 *       endpoints = collection.config.endpoints
 *       adjustedPathname = adjustedPathname.replace(`/${slug}`, '')
 *     }
 *
 * So a config-level endpoint whose path begins with an existing collection
 * slug is unreachable — the list it lives in is never consulted. Registered
 * that way first, and every request answered 404 with nothing in the log but
 * the 404 itself. It is registered on `Posts` (`src/collections/Posts.ts`).
 */
export const recordPostViewEndpoint: Endpoint = {
  path: "/:id/view",
  method: "post",
  handler: async (req) => {
    // `Number()` rather than `parseInt`: "12abc" is NaN here and 12 there, and
    // a router param is a string a caller chose.
    const id = Number(req.routeParams?.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new APIError("Invalid post id", 400);
    }

    // The beacon is a same-origin fetch, so a signed-in reader's session
    // cookie comes with it and Payload has already resolved `req.user` before
    // this runs (`createPayloadRequest` → `executeAuthStrategies`). It is
    // used for one thing only: an owner reading their own article is not
    // counted. Nothing about the reader is stored.
    const readerId = typeof req.user?.id === "number" ? req.user.id : null;

    const { env } = await getCloudflareContext({ async: true });
    await recordPostView(env.D1, id, readerId);

    return new Response(null, { status: 204 });
  },
};
