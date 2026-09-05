"use client";

import Image from "next/image";
import Link from "@/components/i18n/locale-link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RiderAvatar } from "@/components/riders/RiderAvatar";
import {
  TimelineMotionConfig,
  TimelineRail,
  TimelineReveal,
} from "@/components/riders/TimelineMotion";
import { postPublicPath } from "@/lib/content-paths";
import { raceGallerySlug } from "@/lib/race-gallery";
import {
  MonthMediaCard,
  RaceMediaStrip,
} from "@/components/riders/TimelineMediaRow";
import { RaceBadge } from "@/lib/races/badge";
import { resolveBadge } from "@/lib/races/badge-source";
import { catalogueMap } from "@/lib/races/catalogue-shape";
import type { CatalogueEvent, RaceCatalogueMap } from "@/lib/races/catalogue-shape";
import type {
  ClubCursor,
  ClubPost,
  ClubRunner,
  ClubTimelineRow,
} from "@/lib/riders/club-timeline";
import { countClubRows } from "@/lib/riders/club-timeline";
import { formatMonthDay } from "@/lib/riders/timeline";
import { cn } from "@/lib/utils";
import { useDictionary } from "@/components/i18n/dictionary-provider";
import { countLabel } from "@/lib/i18n/count";

/**
 * 全員穿越時光 — the club's races and articles on one rail, newest first.
 *
 * A CLIENT COMPONENT ALL THE WAY DOWN, unlike the per-member timeline, and
 * the infinite scroll is why. A row that arrives from `/api/riders/timeline`
 * has to be rendered by the browser; if the first page were server-rendered
 * by different code there would be two renderers for one row, and they would
 * drift. So the server sends the first page as the same JSON the route sends
 * and this file renders every row — including the first — one way.
 *
 * THE RAIL AND THE REVEAL ARE SHARED with the per-member page
 * (`TimelineMotion.tsx`), so the two pages animate identically and the print
 * and no-JS guards in globals.css cover both.
 *
 * NO JAVASCRIPT MEANS THE FIRST PAGE, which is a real limitation of infinite
 * scroll rather than an oversight: the server renders page one into the HTML,
 * and without a script there is nothing to fetch page two. The print button
 * exists partly for this — it loads the rest *before* opening the dialog, so
 * a printout is the whole rail rather than whatever the reader happened to
 * scroll past.
 */

const RAIL = "left-[15px] sm:left-[19px]";
const NODE = "absolute left-[10px] h-[11px] w-[11px] sm:left-[14px]";
const CONTENT = "pl-10 sm:pl-14";

/** How far below the viewport the sentinel asks for the next page. */
const PREFETCH_MARGIN = "800px";

/** A stop, so a broken cursor cannot spin this into an endless fetch loop. */
const MAX_PAGES = 200;

type Page = {
  events: CatalogueEvent[];
  nextCursor: ClubCursor | null;
  rows: ClubTimelineRow[];
};

/**
 * Union two catalogues, distances included.
 *
 * Each page carries only the distances its own rows draw (`catalogueForRows`),
 * so the same event can arrive twice with different ones — Whistler's 100M on
 * page one and its 50K on page three. Replacing rather than merging would
 * make the older row's band fall back to an upper-cased id the moment a later
 * page landed.
 */
function mergeEvents(current: CatalogueEvent[], incoming: CatalogueEvent[]) {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) {
    const existing = byId.get(event.id);
    if (!existing) {
      byId.set(event.id, event);
      continue;
    }
    const distances = new Map(existing.distances.map((d) => [d.id, d]));
    for (const distance of event.distances) distances.set(distance.id, distance);
    byId.set(event.id, { ...existing, distances: [...distances.values()] });
  }
  return [...byId.values()];
}

function eventName(catalogue: RaceCatalogueMap, eventId: string): string {
  const event = catalogue.get(eventId);
  return event?.nameZh ?? event?.name ?? eventId;
}

function whenLabel(
  row: { day?: string; year: number },
  yearLabel: string,
): string {
  return row.day
    ? formatMonthDay(row.day)
    : yearLabel.replace("{year}", String(row.year));
}

/** The members on a race row: face, name, link to their own page. */
function Runners({ runners }: { runners: ClubRunner[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="club-row-runners">
      {runners.map((runner) => (
        <li key={runner.slug}>
          <Link
            className="group flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
            href={`/riders/${runner.slug}`}
          >
            <RiderAvatar rider={runner} size={24} />
            <span className="group-hover:text-primary">{runner.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PostLine({ compact, post }: { compact: boolean; post: ClubPost }) {
  const t = useDictionary();
  return (
    <Link
      className="group flex min-w-0 gap-3"
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
          className={cn(
            "text-foreground group-hover:text-primary",
            compact ? "text-sm font-semibold" : "text-lg font-extrabold",
          )}
        >
          {compact && <span className="text-muted-foreground">{t.clubTimeline.raceReport}</span>}
          {post.title}
        </h3>
        {post.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {post.description}
          </p>
        )}
        {post.author && (
          <p className="mt-1 text-xs text-muted-foreground">{post.author.name}</p>
        )}
      </div>
    </Link>
  );
}

function Row({
  catalogue,
  row,
}: {
  catalogue: RaceCatalogueMap;
  row: ClubTimelineRow;
}) {
  const t = useDictionary();
  // A month of pictures is a whole row of its own — see the member rail's
  // `Entry` for why it returns early rather than becoming a third branch.
  if (row.month)
    return (
      <MonthMediaCard
        month={row.month}
        photoLabel={t.riderTimeline.photoCount}
        videoLabel={t.riderTimeline.videoCount}
      />
    );

  const race = row.race;
  const badge = race ? resolveBadge(catalogue, race.eventId, race.distanceId) : undefined;
  const kind = race ? (row.posts.length ? "report" : "race") : "post";

  return (
    <article
      className="flex gap-4 border border-border bg-secondary p-4 print:break-inside-avoid"
      data-kind={kind}
      data-testid="club-timeline-row"
      data-year={row.year}
    >
      {race && badge && <RaceBadge {...badge} size={64} year={row.year} />}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {race ? (
          <>
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold text-foreground">
                <Link
                  className="hover:text-primary"
                  href={`/races/${race.eventId}/${row.year}`}
                >
                  {eventName(catalogue, race.eventId)}
                </Link>
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {badge?.distance.label}
                {" · "}
                {whenLabel(row, t.clubTimeline.year)}
                {row.location ? ` · ${row.location}` : ""}
                {race.runners.length > 1 ? countLabel(t.clubTimeline.runnerCount, race.runners.length) : ""}
              </p>
            </div>
            <Runners runners={race.runners} />
            {row.posts.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-border pt-2">
                {row.posts.map((post) => (
                  <PostLine compact key={post.id} post={post} />
                ))}
              </div>
            )}
            {row.media && (
              <RaceMediaStrip
                href={`/gallery/${raceGallerySlug(race.eventId, row.year)}`}
                media={row.media}
                photoLabel={t.riderTimeline.photoCount}
                videoLabel={t.riderTimeline.videoCount}
              />
            )}
          </>
        ) : (
          row.posts[0] && (
            <>
              <PostLine compact={false} post={row.posts[0]} />
              <p className="text-sm text-muted-foreground">{whenLabel(row, t.clubTimeline.year)}</p>
            </>
          )
        )}
      </div>
    </article>
  );
}

export function ClubTimelineFeed({ first }: { first: Page }) {
  const t = useDictionary();
  const [rows, setRows] = useState<ClubTimelineRow[]>(first.rows);
  const [events, setEvents] = useState<CatalogueEvent[]>(first.events);
  const [cursor, setCursor] = useState<ClubCursor | null>(first.nextCursor);
  const [printing, setPrinting] = useState(false);

  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const catalogue = useMemo(() => catalogueMap(events), [events]);

  /**
   * Fetch one page and append it.
   *
   * Returns the next cursor rather than only setting state, so `printAll`
   * below can drive the loop without waiting for React to re-render between
   * pages — reading `cursor` in a loop would read the value captured when the
   * loop started, forever.
   */
  const fetchPage = useCallback(
    async (from: ClubCursor | null): Promise<ClubCursor | null> => {
      if (!from) return null;
      const params = new URLSearchParams({ key: from.key, year: String(from.year) });
      if (from.sortDay) params.set("sortDay", from.sortDay);

      const response = await fetch(`/api/riders/timeline?${params}`);
      if (!response.ok) return null;
      const page = (await response.json()) as Page;

      setRows((prev) => {
        // Deduped by key, because the cursor's fallback branch can return a
        // row already on screen when the row it pointed at has been
        // unpublished between two fetches. Two React children with one key is
        // a console error, and the console guard in e2e/helpers/test.ts fails
        // the whole browser lane on those.
        const seen = new Set(prev.map((row) => row.key));
        return [...prev, ...page.rows.filter((row) => !seen.has(row.key))];
      });
      setEvents((prev) => mergeEvents(prev, page.events));
      setCursor(page.nextCursor);
      return page.nextCursor;
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursor) return;
    loadingRef.current = true;
    try {
      await fetchPage(cursor);
    } finally {
      loadingRef.current = false;
    }
  }, [cursor, fetchPage]);

  useEffect(() => {
    if (!cursor) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  /**
   * Load everything still unfetched, then print.
   *
   * Printing what happens to be loaded is the wrong answer on an infinitely
   * scrolling page: the reader asked for the rail, not for the part of it
   * they had reached. The rows below the fold are also the ones framer-motion
   * has left at `opacity: 0`, which `@media print` in globals.css overrides —
   * so once they are in the DOM they print, whether or not anyone scrolled to
   * them.
   */
  const printAll = useCallback(async () => {
    if (printing) return;
    setPrinting(true);
    try {
      let next = cursor;
      for (let page = 0; next && page < MAX_PAGES; page += 1) {
        // Sequential on purpose: each cursor comes from the page before it.
        next = await fetchPage(next);
      }
    } finally {
      setPrinting(false);
    }
    // After the state flush, so the rows are in the DOM when the dialog opens.
    requestAnimationFrame(() => window.print());
  }, [cursor, fetchPage, printing]);

  const { postCount, raceCount } = countClubRows(rows);

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground" data-testid="club-timeline-empty">
        {t.clubTimeline.empty}
      </p>
    );
  }

  let lastYear: number | null = null;

  return (
    <TimelineMotionConfig>
      {/* Beats framer-motion's inline `opacity: 0` when the script that would
          have cleared it never runs. Raw markup: a <noscript> element's
          children are not parsed by a browser that does run scripts, so React
          must not try to own them. */}
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            "<style>[data-timeline-reveal]{opacity:1!important;transform:none!important}</style>",
        }}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground" data-testid="club-timeline-summary">
          {/* "已載入" and not a total: this is a page of an infinite list, and
              a number claiming to be the club's whole history while more is
              still being fetched would be wrong for as long as anyone is
              reading it. */}
          {t.clubTimeline.loadedPrefix}
          {countLabel(t.clubTimeline.loadedRaces, raceCount)}
          {" · "}
          {countLabel(t.clubTimeline.loadedPosts, postCount)}
          {cursor ? t.clubTimeline.more : ""}
        </p>
        <button
          className="border border-border px-3 py-1 text-xs leading-tight text-muted-foreground transition-colors hover:text-foreground print:hidden"
          data-testid="club-timeline-print"
          disabled={printing}
          onClick={() => void printAll()}
          type="button"
        >
          {printing ? t.clubTimeline.printing : t.clubTimeline.printAll}
        </button>
      </div>

      <div className="rider-timeline relative mt-8" data-testid="club-timeline">
        <TimelineRail className={RAIL} />

        <ol className="space-y-5">
          {rows.map((row, index) => {
            const startsYear = row.year !== lastYear;
            lastYear = row.year;

            return (
              <li key={row.key}>
                {startsYear && (
                  <TimelineReveal className={cn(CONTENT, "pb-1 pt-6 first:pt-0")}>
                    <span
                      aria-hidden
                      className={cn(
                        NODE,
                        "left-[8px] top-[30px] h-[15px] w-[15px] border-2 border-primary bg-background sm:left-[12px]",
                      )}
                    />
                    <h2
                      className="font-heading text-4xl font-extrabold tabular-nums tracking-tight sm:text-5xl"
                      data-testid="club-timeline-year"
                      data-year={row.year}
                    >
                      {row.year}
                    </h2>
                  </TimelineReveal>
                )}
                <TimelineReveal
                  className={cn(CONTENT, startsYear && "mt-5")}
                  // Staggered, capped: a year with twelve races must not make
                  // the last one wait half a second after it is on screen.
                  delay={Math.min(index % 6, 4) * 0.05}
                >
                  <span
                    aria-hidden
                    className={cn(NODE, "top-[20px] border border-border bg-background")}
                  />
                  <Row catalogue={catalogue} row={row} />
                </TimelineReveal>
              </li>
            );
          })}
        </ol>

        {/* Only present while there is somewhere to scroll to, so the observer
            effect above never re-arms against a node that has gone. */}
        {cursor && (
          <div
            aria-hidden="true"
            className="h-px"
            data-testid="club-timeline-sentinel"
            ref={sentinelRef}
          />
        )}
      </div>
    </TimelineMotionConfig>
  );
}
