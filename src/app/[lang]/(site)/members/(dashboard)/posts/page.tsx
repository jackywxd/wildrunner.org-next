import { getCloudflareContext } from "@opennextjs/cloudflare";

import { requireMember } from "@/lib/auth";
import { memberFind } from "@/lib/members/data";
import { readPostViews } from "@/lib/posts/views";
import { PostsList } from "@/components/members/posts/PostsList";
import type { Post } from "@/payload-types";

export const dynamic = "force-dynamic";

export default async function MembersPostsPage() {
  await requireMember();

  // draft: true so the list shows the newest draft title of a published
  // post, not the stale published one (F1-T6).
  const result = await memberFind("posts", {
    depth: 0,
    draft: true,
    limit: 100,
    sort: "-updatedAt",
  });
  const posts = result.docs as Post[];

  /**
   * A SECOND, SEPARATE QUERY, because `post_views` is not a Payload
   * collection — Payload cannot join it and must not learn to, since a counter
   * on a versioned document is the thing the migration header rules out. One
   * statement for the whole page rather than one per row.
   *
   * `memberFind` has already narrowed `posts` to this member's own, so the ids
   * handed over are ones they may read. This does not widen that: it looks up
   * counts *by* those ids and returns nothing for anything else.
   *
   * Failing here must not take the page down. An author's article list is what
   * they came for; the read counts are a detail on each row, and a D1 hiccup
   * that hid the list would trade something they need for something they
   * merely like. An empty Map renders "0" for every row, which is also the
   * honest answer before anyone has read anything.
   */
  let views = new Map<number, number>();
  try {
    const { env } = await getCloudflareContext({ async: true });
    views = await readPostViews(
      env.D1,
      posts.map((post) => post.id),
    );
  } catch {
    /* counts are a detail; the list is the page */
  }

  return (
    <div className="space-y-6">
      <PostsList
        posts={posts}
        views={Object.fromEntries(views)}
      />
    </div>
  );
}
