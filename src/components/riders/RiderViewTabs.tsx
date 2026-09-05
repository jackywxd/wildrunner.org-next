import Link from "@/components/i18n/locale-link";

import { cn } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/dictionary";

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
export async function RiderViewTabs({
  active,
  slug,
}: {
  active: "posts" | "timeline";
  slug: string;
}) {
  const t = await getDictionary();
  const tabs = [
    { href: `/riders/${slug}`, label: t.rider.tabPosts, view: "posts" as const },
    {
      href: `/riders/${slug}/timeline`,
      label: t.rider.tabTimeline,
      view: "timeline" as const,
    },
  ];

  return (
    <nav
      aria-label={t.rider.tabsAria}
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
