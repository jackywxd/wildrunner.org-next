import Link from "@/components/i18n/locale-link";

import { ClubTimelineFeed } from "@/components/riders/ClubTimelineFeed";
import { ComparePairs, ComparePicker } from "@/components/riders/ComparePicker";
import PageHeader from "@/components/page-header";
import { getClubTimelineRows, getRiders } from "@/lib/content";
import { getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import { pageMetadata } from "@/lib/site-metadata";
import { currentLocale, getDictionary } from "@/lib/i18n/dictionary";
import { assignLanes } from "@/lib/riders/club-lanes";
import { catalogueForRows } from "@/lib/riders/club-timeline";
import {
  compareCanonical,
  compareColors,
  compareRows,
  pairCounts,
  parseCompare,
} from "@/lib/riders/compare";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;

/**
 * 成員對照 — two or three members' races on the braided rail, zipped together
 * wherever they ran the same one. See `src/lib/riders/compare.ts`.
 *
 * A STATIC SEGMENT UNDER `/riders`, like `/riders/timeline` beside it, and at
 * the same accepted cost: a member whose slug were literally `compare` would
 * be unreachable.
 *
 * EVERY ROW AT ONCE, NO INFINITE SCROLL. The club rail pages because it is the
 * whole club; two or three members' history is a few dozen rows, and a page
 * that loads in one piece is one a search engine reads in one piece — which
 * this page is meant to be.
 */
async function selection(params: Awaited<Params>) {
  const riders = await getRiders();
  const slugs = parseCompare(params.with, new Set(riders.map((rider) => rider.slug)));
  const chosen = slugs.map((slug) => riders.find((rider) => rider.slug === slug)!);
  return { chosen, riders, slugs };
}

export async function generateMetadata({ searchParams }: { searchParams: Params }) {
  const t = await getDictionary();
  const { chosen, slugs } = await selection(await searchParams);
  const names = chosen.map((rider) => rider.name).join(" × ");
  return pageMetadata({
    locale: await currentLocale(),
    path: compareCanonical(slugs),
    title: slugs.length >= 2 ? names : t.compare.title,
    subtitle:
      slugs.length >= 2 ? t.compare.description.replace("{names}", names) : t.compare.subtitle,
    card: { kind: "plain" },
  });
}

export default async function ComparePage({ searchParams }: { searchParams: Params }) {
  const t = await getDictionary();
  const [{ chosen, riders, slugs }, rows, events] = await Promise.all([
    searchParams.then(selection),
    // Pictures belong to no one person; `compareRows` would drop them anyway.
    getClubTimelineRows({ media: false }),
    getRaceCatalogueEvents(),
  ]);

  const members = chosen.map((rider) => ({ name: rider.name, slug: rider.slug }));
  // Colours from the club's own lanes, so a member is the same colour here as
  // on the braided rail and the homepage map.
  const palette = compareColors(assignLanes(rows), members);
  const comparing = slugs.length >= 2;
  const narrowed = comparing ? compareRows(rows, slugs) : [];
  const names = chosen.map((rider) => rider.name).join(" × ");

  return (
    <div className="container max-w-4xl py-6 lg:py-10">
      <PageHeader
        title={comparing ? names : t.compare.title}
        description={comparing ? t.compare.description.replace("{names}", names) : t.compare.subtitle}
      />

      <ComparePicker members={riders} palette={palette} selected={chosen} />

      {comparing && (
        <>
          <ComparePairs
            counts={pairCounts(narrowed, slugs)}
            names={new Map(members.map((member) => [member.slug, member.name]))}
            palette={palette}
            slugs={slugs}
          />

          <hr className="my-8 h-0 border-t-2 border-border" />

          <ClubTimelineFeed
            braid={{ lanes: members, others: false }}
            compare={{ palette }}
            first={{
              events: catalogueForRows(narrowed, events),
              nextCursor: null,
              rows: narrowed,
            }}
          />
        </>
      )}

      <div className="mt-10 print:hidden">
        <Link className="text-sm text-muted-foreground hover:text-primary" href="/riders/timeline">
          ← {t.clubTimeline.title}
        </Link>
      </div>
    </div>
  );
}
