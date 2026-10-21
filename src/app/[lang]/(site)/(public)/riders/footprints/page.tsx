import Link from "@/components/i18n/locale-link";

import { isAdminUser } from "@/access";
import { FootprintMap } from "@/components/footprints/FootprintMap";
import PageHeader from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { getClubTimelineRows } from "@/lib/content";
import { buildFootprints } from "@/lib/footprints/footprints";
import { currentLocale, getDictionary } from "@/lib/i18n/dictionary";
import { getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import { pageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

/**
 * 野馬足跡: the club's races as one route over a map of dots.
 *
 * `force-dynamic` and no `generateStaticParams`, like its neighbour the
 * timeline: the rows are the members' own and change whenever somebody logs a
 * race, and AGENTS.md explains what a `generateStaticParams` on a dynamic
 * route costs `next dev`.
 *
 * THE SAME ROWS THE TIMELINE READS, WITHOUT ITS ARTICLES AND PICTURES — the
 * loader's `media`/`posts` switches exist for exactly this, and a footprint is
 * a race. `buildFootprints` merges the distances of one edition into one stop
 * and sets aside every race whose event has no coordinate.
 *
 * WHAT CROSSES TO THE CLIENT IS A STOP'S FACTS, not the row. A row carries
 * its runners, and a client component's props are public; a stop needs only
 * how many of them there were. The unplaced list is further narrowed: a
 * visitor is told how many races the map is missing, an admin — the person who
 * can fix it — is also told which.
 */
export async function generateMetadata() {
  const t = await getDictionary();
  return pageMetadata({
    locale: await currentLocale(),
    path: "/riders/footprints",
    title: t.footprints.title,
    subtitle: t.footprints.subtitle,
    card: { kind: "trail-map" },
  });
}

export default async function FootprintsPage() {
  const t = await getDictionary();
  const [rows, events, user] = await Promise.all([
    getClubTimelineRows({ media: false, posts: false }),
    getRaceCatalogueEvents(),
    getCurrentUser(),
  ]);

  const { stops, unplaced } = buildFootprints(rows, events);
  const admin = isAdminUser(user);

  return (
    <div className="container max-w-4xl py-6 lg:py-10">
      <PageHeader title={t.footprints.title} description={t.footprints.pageDescription} />

      <FootprintMap
        stops={stops.map((stop) => ({
          day: stop.day,
          eventId: stop.eventId,
          key: stop.key,
          location: stop.location,
          name: stop.name,
          rowKey: stop.rowKey,
          runners: stop.runners,
          x: stop.x,
          y: stop.y,
          year: stop.year,
        }))}
        unplaced={
          admin
            ? unplaced.map((stop) => ({ key: stop.key, name: stop.name, year: stop.year }))
            : undefined
        }
        unplacedCount={unplaced.length}
      />

      <div className="mt-10 print:hidden">
        <Link className="text-sm text-muted-foreground hover:text-primary" href="/riders/timeline">
          {t.footprints.back}
        </Link>
      </div>
    </div>
  );
}
