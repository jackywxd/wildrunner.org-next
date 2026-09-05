import Link from "@/components/i18n/locale-link";

import { ImportPost } from "@/components/members/posts/ImportPost";
import { requireMember } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The second way to start a post, next to the blank draft `posts-new`
 * creates: bring in a document already written elsewhere (Obsidian, the old
 * Velite content, any markdown editor) instead of retyping it into the
 * Lexical editor from scratch.
 *
 * No data fetching here — `ImportPost` does everything client-side up to
 * `createPost`, the same write path `PostsList` and `StartRaceReport` use.
 * This page's only job is the auth gate and the frame.
 */
export default async function ImportPostPage() {
  await requireMember();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">匯入文章</h1>
        <p className="mt-2 text-sm text-foreground/60">
          貼上或上傳 Markdown / MDX 文件，我們會轉換成文章內容並建立一份草稿。
          圖片不會自動上傳，需要之後在編輯器裡手動補上。
        </p>
      </div>

      <ImportPost />

      <Link
        className="inline-block text-sm text-foreground/50 hover:text-foreground"
        href="/members/posts"
      >
        ← 回到文章列表
      </Link>
    </div>
  );
}
