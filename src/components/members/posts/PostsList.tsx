"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export function PostsList({ posts }: { posts: Post[] }) {
  const router = useRouter();
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
    router.push(`/members/posts/${result.doc.id}`);
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
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">文章</h1>
        <Button
          data-testid="posts-new"
          className="justify-center"
          disabled={creating}
          onClick={create}
        >
          {creating ? "建立中…" : "新增文章"}
        </Button>
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
                className="flex items-center justify-between gap-3 p-4 text-sm"
              >
                <Link
                  href={`/members/posts/${post.id}`}
                  className="flex-1 truncate hover:text-primary"
                >
                  {post.title}
                </Link>
                <span className="flex items-center gap-3 text-xs text-foreground/50">
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
                  {confirmingDelete === post.id ? (
                    <span className="flex items-center gap-2">
                      <button
                        data-testid={`post-delete-confirm-${post.id}`}
                        className="text-destructive hover:underline"
                        onClick={() => remove(post.id)}
                      >
                        確定刪除
                      </button>
                      <button
                        className="hover:underline"
                        onClick={() => setConfirmingDelete(null)}
                      >
                        取消
                      </button>
                    </span>
                  ) : (
                    <button
                      data-testid={`post-delete-${post.id}`}
                      aria-label="刪除"
                      className="text-foreground/40 hover:text-destructive"
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
