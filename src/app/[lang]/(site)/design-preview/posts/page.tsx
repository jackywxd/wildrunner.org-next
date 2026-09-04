import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DesignBanner } from "@/components/design/DesignBanner";

const FAKE_POSTS = [
  { id: 1, title: "UTMB 2026 訓練週記", status: "草稿", updated: "2 小時前" },
  { id: 2, title: "富士山 100 賽後心得", status: "已發布", updated: "3 天前" },
  { id: 3, title: "馬營十週年", status: "已發布", updated: "1 週前" },
  { id: 4, title: "裝備清單：2026 越野季", status: "草稿", updated: "2 週前" },
];

export default function DesignPostsPage() {
  return (
    <div>
      <DesignBanner title="文章列表" />
      <div className="mt-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-2xl font-semibold">文章</h1>
          <Button asChild>
            <Link href="/design-preview/posts/editor" className="justify-center">
              新增文章
            </Link>
          </Button>
        </div>

        <div className="divide-y divide-border border border-border">
          {FAKE_POSTS.map((post) => (
            <Link
              key={post.id}
              href="/design-preview/posts/editor"
              className="flex items-center justify-between p-4 text-sm hover:bg-secondary"
            >
              <span>{post.title}</span>
              <span className="flex items-center gap-3 text-xs text-foreground/50">
                <span
                  className={
                    post.status === "草稿"
                      ? "bg-secondary px-2 py-0.5 text-secondary-foreground"
                      : "bg-primary/10 px-2 py-0.5 text-primary"
                  }
                >
                  {post.status}
                </span>
                {post.updated}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
