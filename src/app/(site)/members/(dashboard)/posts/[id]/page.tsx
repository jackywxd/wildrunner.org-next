import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { memberFindByID } from "@/lib/members/data";
import { PostEditor } from "@/components/members/posts/PostEditor";
import { emptyContent } from "@/lib/editor/empty";
import type { PayloadContent } from "@/lib/editor/serialize";
import type { Post } from "@/payload-types";

export const dynamic = "force-dynamic";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireMember();
  const { id } = await params;

  let post: Post;
  try {
    // depth: 0 is load-bearing — at depth >= 1 every upload node's `value`
    // comes back as a populated Media object, and saving that would write
    // an object into a field that must hold a plain id.
    post = (await memberFindByID("posts", Number(id), {
      depth: 0,
      draft: true,
    })) as Post;
  } catch {
    notFound();
  }

  return (
    <PostEditor
      initial={{
        id: post.id,
        title: post.title ?? "",
        slug: post.slug ?? "",
        description: post.description ?? "",
        status: post._status === "published" ? "published" : "draft",
        content: (post.content as unknown as PayloadContent) ?? emptyContent(),
      }}
    />
  );
}
