import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

export default defineCloudflareConfig({
	incrementalCache: r2IncrementalCache,
	// Required for revalidatePath/revalidateTag to do anything at all.
	// Without a tagCache the incremental cache has no invalidation channel:
	// a page cached as "not found" (someone opening the URL of a post still
	// in draft) stayed cached after publishing, because the revalidatePath
	// call in the Payload afterChange hook had nowhere to record it.
	// Verified both ways — publishing a slug nobody had visited appeared
	// immediately; the same flow with one prior visit did not.
	//
	// Reuses the content D1 rather than adding KV or a Durable Object: the
	// extra load is a row per revalidated tag, and it keeps cutover to a
	// single database. Requires a `revalidations` table (see the
	// add_tag_cache migration).
	tagCache: d1NextTagCache,
	// Serve a cached page before the Next.js server is even loaded.
	//
	// Without this a cache HIT still boots the whole server bundle — Next,
	// Payload, every route — and only then reads the page out of R2. On a
	// site with this little traffic most requests land on a cold isolate, so
	// that load is most of what a cached article costs. The interceptor
	// (@opennextjs/aws `core/routing/cacheInterceptor.js`) answers from the
	// incremental cache straight after routing, so rewrites have already run
	// and `/posts/x` is looked up as `/zh-hant/posts/x`.
	//
	// It still consults the tag cache: a page `revalidatePath` has busted
	// falls through to the server and re-renders, so an edit shows on the
	// next request exactly as before.
	//
	// A *time*-stale page (past the route's `revalidate`) is handed to the
	// revalidation queue, and no queue is configured here — the default is
	// OpenNext's `dummy`, whose `send` throws. The interceptor catches that
	// and falls through to the server, which is what every request did
	// before this flag, so it costs nothing that was not already being paid.
	//
	// Incompatible with PPR, which this app does not use.
	enableCacheInterception: true,
});
