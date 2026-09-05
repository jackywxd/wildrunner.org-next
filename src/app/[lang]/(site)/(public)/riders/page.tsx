import Link from "next/link";

import PageHeader from "@/components/page-header";
import { RiderAvatar } from "@/components/riders/RiderAvatar";
import { RiderBadgeRow } from "@/components/riders/RiderBadges";
import { RiderFilters } from "@/components/riders/RiderFilters";
import { getRiders } from "@/lib/content";
import { catalogueMap, getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import { pageMetadata } from "@/lib/site-metadata";
import { currentLocale, getDictionary } from "@/lib/i18n/dictionary";
import {
  filterRidersByBadges,
  parseRiderBadges,
  riderBadgeOptions,
} from "@/lib/riders/badge-filter";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getDictionary();
  return pageMetadata({
    locale: await currentLocale(),
    path: "/riders",
    title: t.riders.title,
    subtitle: t.riders.subtitle,
    card: { kind: "plain" },
  });
}

export default async function RidersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getDictionary();
  const badges = parseRiderBadges(await searchParams);
  const all = await getRiders();
  // Options are built from every rider and counted against the selection —
  // see riderBadgeOptions. Passing the filtered list instead would make a
  // chip's number describe the page it is already on rather than the page
  // it leads to.
  const options = riderBadgeOptions(
    all,
    catalogueMap(await getRaceCatalogueEvents()),
    badges,
  );
  const riders = filterRidersByBadges(all, badges);

  return (
    // max-w-6xl, the width the home page and /about already use. The
    // directory is a grid of cards rather than a column of prose, so the
    // 4xl it inherited from /posts was measuring it against the wrong
    // thing: 4xl is a reading width, and there is nothing here to read at
    // length. At 6xl a card goes from 424px to 552px.
    <div className="container max-w-6xl py-6 lg:py-10">
      <PageHeader title={t.riders.title} description="" />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <RiderFilters options={options} selected={badges} total={all.length} />
        {/* Beside the badge filters rather than under the heading: both are
            ways into the same set of people, and the timeline is the one that
            answers "what has this club been doing" rather than "who is in
            it". Styled as its own control, not a chip, because it navigates
            instead of narrowing. */}
        <Link
          className="border border-border bg-background px-3 py-1 text-xs leading-tight text-muted-foreground transition-colors hover:text-foreground"
          data-testid="club-timeline-link"
          href="/riders/timeline"
        >
          {t.riders.timeline}
        </Link>
      </div>

      <hr className="my-8 h-0 border-t-2 border-border" />

      {riders.length ? (
        // Two columns still, and the fix is inside the card rather than in
        // the grid. What made this page feel cramped was never the column
        // count: the badges were the last block *inside* the identity
        // column, indented under the name and sharing ~330px with it, and
        // they lengthened the cards that had them and not the ones that did
        // not. So the card gets two stacked zones instead — identity, then
        // a shelf across the card's full width — and the shelf is pinned to
        // the bottom (`mt-auto`, below) so the shelves in a row line up
        // whatever is above them.
        //
        // <ul>/<li> because it is a list of people and announcing "list, 12
        // items" is most of what a screen reader can offer here. `li` is a
        // flex box only so the card can fill the height the grid stretches
        // it to; without that the shelf has no bottom to pin to.
        <ul className="grid gap-4 lg:grid-cols-2" data-testid="rider-list">
          {riders.map((rider) => (
            <li key={rider.slug} className="flex">
              {/* `gap-4` rather than a margin on the shelf: it is the
                  minimum the two zones may ever be apart, and it composes
                  with the shelf's `mt-auto` instead of fighting it — a
                  margin cannot be both "at least 16" and "all of it". */}
              <Link
                className="group flex w-full flex-col gap-4 border border-border bg-secondary p-5 transition-colors hover:bg-accent"
                data-rider-slug={rider.slug}
                data-testid="rider-card"
                href={`/riders/${rider.slug}`}
              >
                <div className="flex items-center gap-4">
                  <RiderAvatar rider={rider} size={64} />
                  <div className="min-w-0">
                    {/* The name changes colour on hover as well as the card
                        changing shade. A whole-card target with no mark on
                        the thing being opened leaves people guessing which
                        of the card's several pieces they are about to
                        follow. */}
                    <h2 className="truncate font-heading text-lg font-semibold transition-colors group-hover:text-primary lg:text-xl">
                      {rider.name}
                    </h2>
                    {rider.bio && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {rider.bio}
                      </p>
                    )}
                    <p
                      className="mt-1 text-xs text-muted-foreground"
                      data-post-count={rider.postCount}
                      data-testid="rider-post-count"
                    >
                      {t.riders.postCount.replace("{count}", String(rider.postCount))}
                    </p>
                  </div>
                </div>
                <RiderBadgeRow records={rider.races} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        // Two different facts, and saying the wrong one is how a filter
        // lies: an empty directory means the club has no members, an empty
        // *result* means nobody here has that badge yet.
        <p className="text-muted-foreground" data-testid="rider-empty">
          {badges.length === 0
            ? t.riders.emptyAll
            : badges.length === 1
              ? t.riders.emptyBadge
              : // Says 同時, because with AND that is the whole reason the
                // page is empty: each badge on its own may well have
                // somebody, and without the word this reads as though none
                // of them does.
                t.riders.emptyBadges}
        </p>
      )}
    </div>
  );
}
