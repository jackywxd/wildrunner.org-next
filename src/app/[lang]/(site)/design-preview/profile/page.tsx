import { Button } from "@/components/ui/button";
import { DesignBanner } from "@/components/design/DesignBanner";

export default function DesignProfilePage() {
  return (
    <div>
      <DesignBanner title="個人資料" />
      <div className="mt-6 max-w-xl space-y-8">
        <h1 className="font-heading text-2xl font-semibold">個人資料</h1>

        <section className="space-y-4 border border-border p-4">
          <h2 className="font-heading text-sm font-semibold text-foreground/70">
            作者身分
          </h2>
          <label className="block space-y-1">
            <span className="text-sm">別名（公開顯示）</span>
            <input
              defaultValue="Alex 野跑"
              className="block w-full border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">簡介</span>
            <textarea
              rows={3}
              defaultValue="喜歡在山裡跑步，也喜歡把過程寫下來。"
              className="block w-full border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 bg-secondary" aria-hidden />
            <Button variant="outline" size="sm" className="justify-center">
              更換頭像
            </Button>
          </div>
        </section>

        <section className="space-y-4 border border-border p-4">
          <h2 className="font-heading text-sm font-semibold text-foreground/70">
            帳號
          </h2>
          <label className="block space-y-1">
            <span className="text-sm">顯示名稱</span>
            <input
              defaultValue="Alex"
              className="block w-full border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <Button variant="outline" size="sm" className="justify-center">
            變更密碼
          </Button>
        </section>

        <section
          className="space-y-3 border border-border p-4"
          data-testid="quota-detail"
        >
          <h2 className="font-heading text-sm font-semibold text-foreground/70">
            儲存空間
          </h2>
          <div className="text-2xl font-heading">
            2.4 <span className="text-base text-foreground/50">/ 10 GB</span>
          </div>
          <div className="h-1.5 bg-secondary">
            <div className="h-full w-[24%] bg-primary" />
          </div>
        </section>

        <div className="flex justify-end">
          <Button className="justify-center">儲存變更</Button>
        </div>
      </div>
    </div>
  );
}
