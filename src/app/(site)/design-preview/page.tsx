import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DesignBanner } from "@/components/design/DesignBanner";

const FAKE_QUOTA = { usedGb: 2.4, quotaGb: 10 };

export default function DesignOverviewPage() {
  const percent = Math.round((FAKE_QUOTA.usedGb / FAKE_QUOTA.quotaGb) * 100);

  return (
    <div>
      <DesignBanner title="總覽" />
      <div className="mt-6 space-y-8">
        <div>
          <h1 className="font-heading text-2xl font-semibold">歡迎回來，Alex</h1>
          <p className="mt-1 text-sm text-foreground/60">
            這裡是你的內容和媒體總覽。
          </p>
        </div>

        <div className="grid gap-4 fhd:grid-cols-3">
          <div className="border border-border p-4">
            <div className="text-xs text-foreground/60">文章</div>
            <div className="mt-1 font-heading text-3xl">12</div>
            <div className="mt-1 text-xs text-foreground/50">3 篇草稿</div>
          </div>
          <div className="border border-border p-4">
            <div className="text-xs text-foreground/60">媒體檔案</div>
            <div className="mt-1 font-heading text-3xl">86</div>
          </div>
          <div className="border border-border p-4" data-testid="quota-card">
            <div className="text-xs text-foreground/60">儲存空間</div>
            <div className="mt-1 font-heading text-3xl">
              {FAKE_QUOTA.usedGb} <span className="text-base text-foreground/50">/ {FAKE_QUOTA.quotaGb} GB</span>
            </div>
            <div className="mt-2 h-1.5 bg-secondary">
              <div
                className="h-full bg-primary"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button asChild>
            <Link href="/design-preview/posts/editor" className="justify-center">
              寫新文章
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/design-preview/media" className="justify-center">
              上傳媒體
            </Link>
          </Button>
        </div>

        <div>
          <h2 className="font-heading text-lg font-semibold">最近的文章</h2>
          <div className="mt-3 divide-y divide-border border border-border">
            {[
              { title: "UTMB 2026 訓練週記", status: "草稿", updated: "2 小時前" },
              { title: "富士山 100 賽後心得", status: "已發布", updated: "3 天前" },
              { title: "馬營十週年", status: "已發布", updated: "1 週前" },
            ].map((post) => (
              <div key={post.title} className="flex items-center justify-between p-3 text-sm">
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
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
