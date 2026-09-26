import Link from "@/components/i18n/locale-link";

import { ClubTimelineFeed } from "@/components/riders/ClubTimelineFeed";
import {
  ClubTimelineViewTabs,
  parseClubTimelineView,
} from "@/components/riders/ClubTimelineViewTabs";
import PageHeader from "@/components/page-header";
import { getClubTimelineRows } from "@/lib/content";
import { getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import { pageMetadata } from "@/lib/site-metadata";
import { currentLocale, getDictionary } from "@/lib/i18n/dictionary";
import { assignLanes } from "@/lib/riders/club-lanes";
import {
  CLUB_PAGE_SIZE,
  catalogueForRows,
  clubTimelinePage,
} from "@/lib/riders/club-timeline";

export const dynamic = "force-dynamic";


/**
 * The club's time machine: every member's races and articles on one rail.
 *
 * A STATIC SEGMENT UNDER `/riders`, which Next resolves ahead of the
 * `[slug]` beside it. The cost is that a member whose slug were literally
 * `timeline` would be unreachable — accepted rather than overlooked, because
 * the alternative (`/timeline` at the site root) puts the club's rail
 * somewhere unrelated to the members it is made of, and slugs come from
 * `author-alias.ts` off a display name.
 *
 * The first page is rendered here and every later one comes from
 * `/api/riders/timeline` as the reader scrolls. Both call the same
 * `getClubTimelineRows()` and slice it the same way, so the route can never
 * return something this page would not have.
 */
export async function generateMetadata() {
  const t = await getDictionary();
  return pageMetadata({
    locale: await currentLocale(),
    path: "/riders/timeline",
    title: t.clubTimeline.title,
    subtitle: t.clubTimeline.subtitle,
    card: { kind: "plain" },
  });
}

export default async function ClubTimelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getDictionary();
  const params = await searchParams;
  const view = parseClubTimelineView(params);
  const [rows, events] = await Promise.all([
    getClubTimelineRows(),
    getRaceCatalogueEvents(),
  ]);

  // `?at=<row key>` — the homepage map links to one race. That row may be
  // several pages down an infinite scroll, so the first page is stretched to
  // reach it (and a few rows past, so it is not the last thing on screen);
  // the fragment in the same link then scrolls to it. An unknown key is
  // ignored, never an error.
  const at = typeof params.at === "string" ? rows.findIndex((row) => row.key === params.at) : -1;
  const page = clubTimelinePage(rows, null, Math.max(CLUB_PAGE_SIZE, at + 4));
  // Over every row, not the first page: see `assignLanes` for why the lanes
  // are the club's and not the screen's.
  const braid = view === "braid" ? assignLanes(rows) : undefined;

  return (
    <div className="container max-w-4xl py-6 lg:py-10">
      <PageHeader
        title={t.clubTimeline.title}
        description={t.clubTimeline.pageDescription}
      />

      <ClubTimelineViewTabs active={view} />

      <hr className="my-8 h-0 border-t-2 border-border" />

      <ClubTimelineFeed
        braid={braid}
        first={{ ...page, events: catalogueForRows(page.rows, events) }}
      />

      <div className="mt-10 print:hidden">
        <Link className="text-sm text-muted-foreground hover:text-primary" href="/riders">
          {t.clubTimeline.allMembers}
        </Link>
      </div>
    </div>
  );
}
