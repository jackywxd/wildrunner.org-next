import Image from "next/image";
import Link from "next/link";

import type { MediaMonth, RaceMedia } from "@/lib/riders/timeline-albums";
import { formatMonth } from "@/lib/riders/timeline-albums";
import { cn } from "@/lib/utils";
import { countLabel } from "@/lib/i18n/count";

/**
 * The two shapes pictures take on 穿越時光: a strip under a race, and a month of
 * their own.
 *
 * NO `"use client"`, DELIBERATELY. The member rail renders these from a server
 * component and the club rail from a client one, and a presentational
 * component with no hooks and no server-only imports is legal in both — it
 * compiles into whichever tree imports it. Marking it would drag the member
 * rail's rows into the browser bundle for nothing; putting a copy in each
 * would be two renderers for one row, which is the split this file exists to
 * avoid.
 */

/** "12 張相片 · 3 段影片", with either half dropped when it is zero. */
function countsLabel(
  photos: number,
  videos: number,
  photoLabel: string,
  videoLabel: string,
): string {
  const parts: string[] = [];
  if (photos > 0) parts.push(countLabel(photoLabel, photos));
  if (videos > 0) parts.push(countLabel(videoLabel, videos));
  return parts.join(" · ");
}

/**
 * The pictures themselves.
 *
 * `sizes` is fixed at the rendered box rather than the viewport: these are
 * 64-80px squares whatever the screen, so letting Next guess would fetch a
 * full-width source for a thumbnail.
 */
function Thumbnails({ images }: { images: { blurDataURL?: string; height: number; src: string; width: number }[] }) {
  if (images.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" data-testid="timeline-thumbnails">
      {images.map((image) => (
        <li key={image.src}>
          <Image
            alt=""
            blurDataURL={image.blurDataURL}
            className="h-14 w-14 object-cover sm:h-16 sm:w-16"
            height={image.height}
            loading="lazy"
            placeholder={image.blurDataURL ? "blur" : undefined}
            sizes="64px"
            src={image.src}
            width={image.width}
          />
        </li>
      ))}
    </ul>
  );
}

/** The albums a row's pictures came from, each a link. Loose pictures name none. */
function AlbumLinks({ albums }: { albums: { name: string; slug: string }[] }) {
  if (albums.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1" data-testid="timeline-album-links">
      {albums.map((album) => (
        <li key={album.slug}>
          <Link
            className="text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
            data-album-slug={album.slug}
            href={`/gallery/${album.slug}`}
          >
            {album.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * A race's pictures, under the race they are of.
 *
 * `href` is the race's own album — the virtual `/gallery/race-<key>-<year>`
 * that `race-gallery.ts` describes, which is where every picture tagged with
 * that edition already lives. The strip is a way in, not the collection.
 */
/**
 * THE TWO COUNT LABELS ARRIVE AS PROPS, like `countsLabel`'s already do.
 * These two components render from both sides of the boundary — `RiderTimeline`
 * is a Server Component and `ClubTimelineFeed` is a Client one — and neither
 * dictionary accessor works in both. Each parent already holds a dictionary,
 * so handing the two strings down costs a line at two call sites and removes
 * the whole question.
 */
export function RaceMediaStrip({
  href,
  media,
  photoLabel,
  videoLabel,
}: {
  href: string;
  media: RaceMedia;
  photoLabel: string;
  videoLabel: string;
}) {
  return (
    <div
      className="flex flex-col gap-2 border-t border-border pt-2"
      data-testid="timeline-race-media"
    >
      <Link
        className="text-sm font-semibold text-muted-foreground hover:text-primary"
        href={href}
      >
        {countsLabel(
          media.photoCount,
          media.videoCount,
          photoLabel,
          videoLabel,
        )}{" "}
        →
      </Link>
      <AlbumLinks albums={media.albums} />
      <Thumbnails images={media.thumbnails} />
    </div>
  );
}

/**
 * A month of pictures that belong to no race.
 *
 * ONE ROW, BUT THE NAMES SURVIVE — the rule the plan settled on. A card that
 * only said "2025年4月 · 51 張" would throw away "Panorama ridge night run",
 * which is a thing a person wrote and the only way back to that album.
 */
export function MonthMediaCard({
  className,
  month,
  photoLabel,
  videoLabel,
}: {
  className?: string;
  month: MediaMonth;
  photoLabel: string;
  videoLabel: string;
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-2 border border-border bg-secondary p-4 print:break-inside-avoid",
        className,
      )}
      data-kind="month"
      data-month={month.month}
      data-testid="timeline-month"
    >
      <div>
        <h3 className="text-lg font-extrabold text-foreground">
          {formatMonth(month.month)}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {countsLabel(
            month.photoCount,
            month.videoCount,
            photoLabel,
            videoLabel,
          )}
        </p>
      </div>
      <AlbumLinks albums={month.albums} />
      <Thumbnails images={month.thumbnails} />
    </article>
  );
}
