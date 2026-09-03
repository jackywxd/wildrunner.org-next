import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The switch between a member's two views: their articles, and their timeline.
 *
 * LINKS, NOT CLIENT STATE, for the reason `RiderFilters` gives: both views are
 * fully server-rendered, each has its own URL, and an e2e assertion is a plain
 * click. Nothing hydrates.
 *
 * Rendered by both pages, so whichever one a reader lands on offers the other.
 * `aria-current="page"` rather than only a colour — the active tab has to be
 * announced, not just seen.
 */
export function RiderViewTabs({
  active,
  slug,
}: {
  active: "posts" | "timeline";
  slug: string;
}) {
  const tabs = [
    { href: `/riders/${slug}`, label: "文章", view: "posts" as const },
    { href: `/riders/${slug}/timeline`, label: "時間機", view: "timeline" as const },
  ];

  return (
    <nav
      aria-label="檢視方式"
      className="flex items-center gap-2 print:hidden"
      data-testid="rider-view-tabs"
    >
      {tabs.map((tab) => (
        <Link
          aria-current={tab.view === active ? "page" : undefined}
          className={cn(
            "border px-3 py-1 text-xs leading-tight transition-colors",
            tab.view === active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
          data-testid="rider-view-tab"
          data-view={tab.view}
          href={tab.href}
          key={tab.view}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
