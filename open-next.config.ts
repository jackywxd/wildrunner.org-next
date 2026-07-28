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
});
