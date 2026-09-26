import Link from "@/components/i18n/locale-link";

import { TimelinePlayer } from "@/components/riders/TimelinePlayer";
import { cn } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/dictionary";

export type ClubTimelineView = "braid" | "single";

/**
 * The switch between the club rail's two drawings: the single line it has
 * always had, and the braid of one lane per member.
 *
 * LINKS, NOT CLIENT STATE, for the reason `RiderViewTabs` gives: both views
 * are fully server-rendered, each has its own URL, and an e2e assertion is a
 * plain click. It also means the braid can be linked to, and that a reload
 * never flashes the single line before swapping to the one the reader chose.
 *
 * The single line keeps the bare address. It is the default, it is what every
 * existing link and the canonical URL point to, and a toggle must not turn
 * the page people already share into a different one.
 */
export function parseClubTimelineView(
  params: Record<string, string | string[] | undefined>,
): ClubTimelineView {
  return params.view === "braid" ? "braid" : "single";
}

export async function ClubTimelineViewTabs({ active }: { active: ClubTimelineView }) {
  const t = await getDictionary();
  const tabs = [
    { href: "/riders/timeline", label: t.clubTimeline.viewSingle, view: "single" as const },
    { href: "/riders/timeline?view=braid", label: t.clubTimeline.viewBraid, view: "braid" as const },
  ];

  return (
    <nav
      aria-label={t.clubTimeline.viewAria}
      className="mt-6 flex items-center gap-2 print:hidden"
      data-testid="club-timeline-views"
    >
      {tabs.map((tab) => (
        <Link
          aria-current={tab.view === active ? "page" : undefined}
          className={cn(
            "border hit-area inline-flex min-h-9 items-center px-3 text-tag transition-colors",
            tab.view === active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
          data-testid="club-timeline-view"
          data-view={tab.view}
          href={tab.href}
          key={tab.view}
        >
          {tab.label}
        </Link>
      ))}
      <div className="ml-auto flex items-center gap-2">
        {/* 播放 watches this page scroll by, with music; it works on either
            drawing, so it sits with 對照 rather than among the two tabs. */}
        <TimelinePlayer />
        {/* Beside the two drawings rather than one of them: it leaves this
            page for 成員對照, the same rail narrowed to two or three people. */}
        <Link
          className="border border-border bg-background hit-area inline-flex min-h-9 items-center px-3 text-tag text-muted-foreground transition-colors hover:text-foreground"
          data-testid="club-timeline-compare"
          href="/riders/compare"
        >
          {t.clubTimeline.compare}
        </Link>
      </div>
    </nav>
  );
}
