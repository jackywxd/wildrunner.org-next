import { requireMember } from "@/lib/auth";
import { memberFind } from "@/lib/members/data";
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

  return (
    <div className="space-y-6">
      <PostsList posts={result.docs as Post[]} />
    </div>
  );
}
