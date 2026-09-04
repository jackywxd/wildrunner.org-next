import { notFound } from "next/navigation";
import { MemberShellNav } from "@/components/design/MemberShellNav";

/**
 * Design-review-only shell for the member dashboard mockup (Phase C).
 * Clickable, real Tailwind tokens, entirely fake data — no backend calls.
 * Never reaches a production build: the plan gates it on NODE_ENV rather
 * than NEXTJS_ENV specifically so it stays reachable in an ordinary local
 * `pnpm dev` session for Jacky to click through, not only under Playwright
 * (which sets NEXTJS_ENV=test but isn't how a human reviews a UI).
 *
 * Deleted once Phase D's real routes replace it.
 */
export default function DesignLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="flex min-h-[80vh] flex-col">
      <div className="border-b border-border bg-primary px-4 py-2 text-xs text-primary-foreground">
        管理員檢視 · <a href="/design-preview" className="underline">切換到會員介面</a>
        {" — "}
        <a href="/admin" className="underline">返回 Payload 後台</a>
      </div>
      <div className="flex flex-1 fhd:flex-row flex-col">
        <MemberShellNav />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
