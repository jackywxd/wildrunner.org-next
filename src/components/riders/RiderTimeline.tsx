import Image from "next/image";
import Link from "next/link";

import { postPublicPath } from "@/lib/content-paths";
import { raceGallerySlug } from "@/lib/race-gallery";
import {
  MonthMediaCard,
  RaceMediaStrip,
} from "@/components/riders/TimelineMediaRow";
import { cn } from "@/lib/utils";
import type { SitePost } from "@/lib/content-types";
import { RaceBadge } from "@/lib/races/badge";
import { resolveBadge } from "@/lib/races/badge-source";
import { catalogueMap, getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import type { RaceCatalogueMap } from "@/lib/races/catalogue-shape";
import { formatMonthDay, summariseTimeline } from "@/lib/riders/timeline";
import { getDictionary } from "@/lib/i18n/dictionary";
import type {
  RiderTimelineEntry,
  RiderTimelineYear,
} from "@/lib/riders/timeline";
import {
  TimelineDownloadButton,
  TimelineMotionConfig,
  TimelinePrintButton,
  TimelineReveal,
  TimelineRail,
} from "@/components/riders/TimelineMotion";

/**
 * 穿越時光 — a member's races and articles on one rail, newest first.
 *
 * A SERVER COMPONENT WRAPPING CLIENT ONES, not the other way round. The rows
 * carry badges, cover images and links, all of which resolve against the
 * catalogue and the media table; making the whole timeline a client component
 * to get `whileInView` would mean shipping the catalogue to the browser. So
 * `TimelineReveal` takes the finished row as `children` and only the motion
 * wrapper hydrates. See TimelineMotion.tsx for what that costs and why it is
 * guarded.
 *
 * THE RAIL'S GEOMETRY IS ONE NUMBER IN THREE PLACES and they have to agree:
 * the rail sits at x = 15px (19 from `sm`), a row's dot is centred on it, and
 * the content clears it. Written as literals rather than a CSS variable
 * because Tailwind's arbitrary values are what the rest of this codebase
 * uses, and a variable that only two files read is a worse trade than three
 * numbers next to each other.
 */

const RAIL = "left-[15px] sm:left-[19px]";
/**
 * A dot centred on the rail. The `left` is the rail's x minus half the dot,
 * which is why the two constants have to be read together.
 *
 * THE PADDING BELONGS TO THE SAME ELEMENT AS THE DOT. An absolutely
 * positioned child resolves against its containing block's *padding box*,
 * whose left edge is the border edge — so `left-[10px]` measures from the
 * row's left edge whatever `pl-*` it carries. Put the padding on a wrapper
 * instead and the dot moves in by 40px and misses the rail entirely.
 */
const NODE = "absolute left-[10px] h-[11px] w-[11px] sm:left-[14px]";
const CONTENT = "pl-10 sm:pl-14";

/** "3 場比賽 · 2 篇文章", with either half dropped when it is zero. */
function countsLabel(
  races: number,
  posts: number,
  raceLabel: string,
  postLabel: string,
): string {
  const parts: string[] = [];
  if (races > 0) parts.push(raceLabel.replace("{count}", String(races)));
  if (posts > 0) parts.push(postLabel.replace("{count}", String(posts)));
  return parts.join(" · ");
}

/**
 * When it happened, in the most precise form the data supports.
 *
 * A race whose edition carries no start date is "2024 年", not a guessed day
 * — see `buildRiderTimeline`, which sorts those to the bottom of their year
 * for the same reason.
 */
function whenLabel(
  entry: RiderTimelineEntry,
  year: number,
  yearLabel: string,
): string {
  return entry.day ? formatMonthDay(entry.day) : yearLabel.replace("{year}", String(year));
}

function eventName(catalogue: RaceCatalogueMap, eventId: string): string {
  const event = catalogue.get(eventId);
  // `nameZh` first, matching every other place the site names a race to a
  // Chinese-reading visitor; the key itself last, so a race dropped from the
  // catalogue still renders a row rather than an empty one (A-T4).
  return event?.nameZh ?? event?.name ?? eventId;
}

/** The article half of a row: cover, title, description. */
async function PostBody({
  post,
  compact,
}: {
  compact: boolean;
  post: SitePost;
}) {
  const t = await getDictionary();
  return (
    <Link
      className="group flex min-w-0 flex-1 gap-3"
      data-post-slug={post.slug}
      href={postPublicPath(post.slug)}
    >
      {post.image && (
        <Image
          alt={post.title}
          blurDataURL={post.image.blurDataURL}
          className="h-16 w-16 shrink-0 object-cover grayscale sm:h-20 sm:w-20"
          height={post.image.height}
          loading="lazy"
          placeholder={post.image.blurDataURL ? "blur" : undefined}
          sizes="80px"
          src={post.image.src}
          width={post.image.width}
        />
      )}
      <div className="min-w-0">
        <h3
          className={
            compact
              ? "text-sm font-semibold text-foreground group-hover:text-primary"
              : "text-lg font-extrabold text-foreground group-hover:text-primary"
          }
        >
          {compact && <span className="text-muted-foreground">{t.riderTimeline.raceReport}</span>}
          {post.title}
        </h3>
        {post.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {post.description}
          </p>
        )}
      </div>
    </Link>
  );
}

async function Entry({
  catalogue,
  entry,
  year,
}: {
  catalogue: RaceCatalogueMap;
  entry: RiderTimelineEntry;
  year: number;
}) {
  const t = await getDictionary();
  const { post, race } = entry;
  // A month of pictures is a whole row of its own and shares nothing with the
  // two below it, so it returns early rather than growing a third branch
  // inside a card built around a badge and an article.
  if (entry.month)
    return (
      <MonthMediaCard
        month={entry.month}
        photoLabel={t.riderTimeline.photoCount}
        videoLabel={t.riderTimeline.videoCount}
      />
    );

  // Three shapes, one attribute, so a test can say which it expected rather
  // than inferring it from what happens to be inside the card.
  const kind = race ? (post ? "report" : "race") : "post";
  const badge = race
    ? resolveBadge(catalogue, race.eventId, race.distanceId)
    : undefined;

  return (
    <article
      className="flex gap-4 border border-border bg-secondary p-4 print:break-inside-avoid"
      data-kind={kind}
      data-testid="rider-timeline-entry"
      data-year={year}
    >
      {race && badge && <RaceBadge {...badge} size={64} year={race.year} />}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {race ? (
          <>
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold text-foreground">
                <Link
                  className="hover:text-primary"
                  href={`/races/${race.eventId}/${race.year}`}
                >
                  {eventName(catalogue, race.eventId)}
                </Link>
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {badge?.distance.label}
                {" · "}
                {whenLabel(entry, year, t.riderTimeline.year)}
                {entry.location ? ` · ${entry.location}` : ""}
              </p>
            </div>
            {/* The report, on the same row as the race it is about. A member
                who logged a race and then wrote it up has one day of history,
                not two. */}
            {post && (
              <div className="border-t border-border pt-2">
                <PostBody compact post={post} />
              </div>
            )}
            {entry.media && (
              <RaceMediaStrip
                href={`/gallery/${raceGallerySlug(race.eventId, race.year)}`}
                media={entry.media}
                photoLabel={t.riderTimeline.photoCount}
                videoLabel={t.riderTimeline.videoCount}
              />
            )}
          </>
        ) : (
          post && (
            <>
              <PostBody compact={false} post={post} />
              <p className="text-sm text-muted-foreground">
                {whenLabel(entry, year, t.riderTimeline.year)}
              </p>
            </>
          )
        )}
      </div>
    </article>
  );
}

export async function RiderTimeline({
  name,
  slug,
  years,
}: {
  name: string;
  /** The member's own slug — addresses their PDF endpoint. */
  slug: string;
  years: RiderTimelineYear[];
}) {
  const t = await getDictionary();
  const catalogue = catalogueMap(await getRaceCatalogueEvents());
  const { firstYear, lastYear, postCount, raceCount } =
    summariseTimeline(years);

  if (years.length === 0) {
    return (
      <p className="text-muted-foreground" data-testid="rider-timeline-empty">
        {t.riderTimeline.empty}
      </p>
    );
  }

  return (
    <TimelineMotionConfig>
      {/* Beats framer-motion's inline `opacity: 0` when the script that would
          have cleared it never runs. Written as raw markup because a
          `<noscript>` element's children are not parsed by the browser that
          does run scripts, so React must not try to own them. */}
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            "<style>[data-timeline-reveal]{opacity:1!important;transform:none!important}</style>",
        }}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p
          className="text-sm text-muted-foreground"
          data-testid="rider-timeline-summary"
        >
          {countsLabel(raceCount, postCount, t.riderTimeline.raceCount, t.riderTimeline.postCount)}
          {firstYear !== undefined && lastYear !== undefined
            ? ` · ${firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`}`
            : ""}
        </p>
        {/* Two buttons that do different things — `TimelineDownloadButton`
            says which, and why only this rail has the second one. */}
        <span className="flex flex-wrap items-center gap-2 print:hidden">
          <TimelinePrintButton label={t.common.print} />
          <TimelineDownloadButton slug={slug} />
        </span>
      </div>

      <div
        className="rider-timeline relative mt-8"
        data-testid="rider-timeline"
      >
        <TimelineRail className={RAIL} />

        {years.map((yearGroup) => {
          const races = yearGroup.entries.filter((entry) => entry.race).length;
          const posts = yearGroup.entries.filter((entry) => entry.post).length;

          return (
            <section
              className="pb-10 last:pb-0"
              data-testid="rider-timeline-year"
              data-year={yearGroup.year}
              key={yearGroup.year}
            >
              <TimelineReveal className={CONTENT}>
                {/* Larger and in the accent colour: a year is the rail's
                    milestone, and drawing it the same as a row's dot loses
                    the only structure the rail has. */}
                <span
                  aria-hidden
                  className={cn(
                    NODE,
                    "left-[8px] top-[14px] h-[15px] w-[15px] border-2 border-primary bg-background sm:left-[12px]",
                  )}
                />
                <h2 className="font-heading text-4xl font-extrabold tabular-nums tracking-tight sm:text-5xl">
                  {yearGroup.year}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {countsLabel(races, posts, t.riderTimeline.raceCount, t.riderTimeline.postCount)}
                </p>
              </TimelineReveal>

              <ol className="mt-5 space-y-5">
                {yearGroup.entries.map((entry, index) => (
                  <li key={entry.key}>
                    <TimelineReveal
                      className={CONTENT}
                      // Staggered within a year, capped: a year with twelve
                      // races must not make the last one wait half a second
                      // after it is already on screen.
                      delay={Math.min(index, 4) * 0.05}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          NODE,
                          "top-[20px] border border-border bg-background",
                        )}
                      />
                      <Entry
                        catalogue={catalogue}
                        entry={entry}
                        year={yearGroup.year}
                      />
                    </TimelineReveal>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>

      <p className="sr-only">{t.riderTimeline.endOfTimeline.replace("{name}", name)}</p>
    </TimelineMotionConfig>
  );
}
