"use client";

import { useState } from "react";
import Link from "@/components/i18n/locale-link";
import { usePathname, useRouter } from "next/navigation";
import { localeHref } from "@/lib/i18n/locale-href";
import { Button } from "@/components/ui/button";
import { createPost, deletePost } from "@/lib/members/posts";
import { emptyContent } from "@/lib/editor/empty";
import type { Post } from "@/payload-types";

function formatUpdated(iso: string | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function PostsList({
  posts,
  /**
   * Read counts by post id. A PLAIN OBJECT, not the Map the data layer
   * returns: this crosses the server/client boundary as a prop, and a Map is
   * not serializable — the page converts it once.
   *
   * A post missing from here has not been read yet rather than being an
   * error, so the row renders 0.
   */
  views = {},
}: {
  posts: Post[];
  views?: Record<number, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  async function create() {
    setCreating(true);
    setError("");
    const stamp = Date.now();
    const result = await createPost({
      title: "未命名文章",
      slug: `untitled-${stamp}`,
      description: "　",
      content: emptyContent(),
    });
    if (!result.ok) {
      setError(result.message);
      setCreating(false);
      return;
    }
    router.push(localeHref(`/members/posts/${result.doc.id}`, pathname));
  }

  async function remove(id: number) {
    if (!(await deletePost(id))) {
      setError("刪除失敗");
      return;
    }
    setConfirmingDelete(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">文章</h1>
        <div className="flex gap-2">
          <Button
            data-testid="posts-import"
            variant="outline"
            className="justify-center"
            asChild
          >
            <Link href="/members/posts/import">匯入文章</Link>
          </Button>
          <Button
            data-testid="posts-new"
            className="justify-center"
            disabled={creating}
            onClick={create}
          >
            {creating ? "建立中…" : "新增文章"}
          </Button>
        </div>
      </div>

      {error && (
        <p data-testid="posts-error" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {posts.length === 0 ? (
        <p data-testid="posts-empty" className="text-sm text-foreground/50">
          還沒有文章，寫下第一篇吧。
        </p>
      ) : (
        <div
          className="divide-y divide-border border border-border"
          data-testid="posts-list"
        >
          {posts.map((post) => {
            const published = post._status === "published";
            return (
              <div
                key={post.id}
                data-testid={`post-row-${post.id}`}
                data-status={post._status ?? "draft"}
                // Two lines on a phone: the title on its own, the status,
                // date, reads and delete under it. In one line the meta
                // cluster did not shrink, so a `truncate` title was squeezed
                // to nothing at 320px.
                className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <Link
                  href={`/members/posts/${post.id}`}
                  className="min-w-0 flex-1 hover:text-primary sm:truncate"
                >
                  {post.title}
                </Link>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground/50 sm:text-xs">
                  <span
                    className={
                      published
                        ? "bg-primary/10 px-2 py-0.5 text-primary"
                        : "bg-secondary px-2 py-0.5 text-secondary-foreground"
                    }
                  >
                    {published ? "已發布" : "草稿"}
                  </span>
                  {formatUpdated(post.updatedAt)}
                  {/* Only on a published post. A draft has no public URL, so
                      its count is 0 by construction and printing it would
                      read as "nobody read this" rather than "this is not out
                      yet". */}
                  {published && (
                    <span data-testid={`post-views-${post.id}`}>
                      {views[post.id] ?? 0} 次閱讀
                    </span>
                  )}
                  {confirmingDelete === post.id ? (
                    <span className="flex items-center gap-2">
                      <button
                        data-testid={`post-delete-confirm-${post.id}`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center md:min-h-0 md:min-w-0 text-destructive hover:underline"
                        onClick={() => remove(post.id)}
                      >
                        確定刪除
                      </button>
                      <button
                        className="inline-flex min-h-11 min-w-11 items-center justify-center md:min-h-0 md:min-w-0 hover:underline"
                        onClick={() => setConfirmingDelete(null)}
                      >
                        取消
                      </button>
                    </span>
                  ) : (
                    <button
                      data-testid={`post-delete-${post.id}`}
                      aria-label="刪除"
                      className="inline-flex min-h-11 min-w-11 items-center justify-center md:min-h-0 md:min-w-0 text-foreground/40 hover:text-destructive"
                      onClick={() => setConfirmingDelete(post.id)}
                    >
                      ✕
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
