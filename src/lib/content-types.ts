/** Public-site shapes decoupled from Velite and Payload document types. */

import type { RaceSeries } from "./races/catalogue";
import type { RaceQualifiers } from "./races/qualifiers";

export type SiteImage = {
  src: string;
  width: number;
  height: number;
  blurDataURL?: string;
};

export type SitePhoto = SiteImage & {
  /**
   * The media doc's own id, carried for the same reason `SiteVideo` carries
   * one: it is the address of the share page, `/gallery/m/[mediaId]`.
   *
   * A photo had no id here at all until the grid grew a share button, because
   * nothing resolved a photo by anything but its `src`. Videos had one only
   * because their share route predates the unified one.
   */
  mediaId: number;
  filename: string;
  slug: string;
  featured: boolean;
  /**
   * `media.description` — what this picture is about, when somebody has
   * written it. `undefined` means nobody has; every reader renders nothing
   * rather than an empty caption.
   */
  description?: string;
  blurWidth?: number;
  blurHeight?: number;
  /** The underlying media doc's own createdAt — for sorting a flat, cross-gallery photo list by time. */
  createdAt: string;
};

export type SiteVideo = {
  mediaId: number;
  id: string;
  filename: string;
  src: string;
  mimeType: string;
  slug: string;
  size?: number;
  extension?: string;
  lastModified?: string;
  streamId?: string | null;
  streamReady?: boolean;
  /**
   * A still frame from the video, when the transcoder has managed to take
   * one. Absent on every video that predates posters and on any the container
   * could not read a frame from, so every consumer needs a fallback — see
   * `VideoCard` in MediaGrid, which keeps drawing its dark card without one.
   */
  poster?: string;
  /**
   * What a person named the file, when they have. `undefined` means nobody
   * has — `mediaDisplayName` then derives a label from the URL, exactly as
   * every video without a title already gets.
   */
  title?: string;
  /** `media.description`, as on `SitePhoto`. */
  description?: string;
  /**
   * The media doc's own createdAt, for the same reason `SitePhoto` carries one.
   *
   * Its absence is why /gallery's video strip could not be sorted at all: the
   * strip is built as "album videos, then the rest of the library", so a
   * member's newest upload landed behind every album video — 24th, on a
   * horizontally scrolling strip nobody scrolls. The flat photo list next to
   * it has been date-sorted the whole time.
   */
  createdAt: string;
};

/**
 * One entry in an album, in the order its curator put it there.
 *
 * A discriminated union over the two shapes that already exist rather than a
 * third shape of its own: what a photo is and what a video is has not changed,
 * only whether an album is allowed to interleave them. `SitePhoto` and
 * `SiteVideo` keep every other caller (the rich-text renderer, the member
 * editor's preview, PhotoCard, the homepage) untouched.
 *
 * `kind` rather than reading `mimeType` at each call site: the split used to
 * happen once in mapPayloadGallery and every consumer inherited two lists, so
 * nothing downstream ever had to ask. Now that they share one list, they do —
 * and a discriminant TypeScript can narrow on is cheaper to get right than a
 * string prefix test repeated in six components.
 */
export type SiteMediaItem =
  | ({ kind: "photo" } & SitePhoto)
  | ({ kind: "video" } & SiteVideo);

/** One race edition a member can tag an upload with — already run, so a photo of it can exist. */
export type SiteRaceEditionOption = {
  id: number;
  eventKey: string;
  name: string;
  nameZh?: string;
  year: number;
};

/** An edition as its own public page shows it — the event's identity plus this run's dates. */
export type SiteRaceEditionDetail = {
  id: number;
  eventKey: string;
  name: string;
  nameZh?: string;
  series: RaceSeries;
  country?: string;
  year: number;
  startDate?: string;
  endDate?: string;
  location?: string;
  url?: string;
  distanceSummary?: string;
};

/**
 * A photo on a race's public wall. `uploaderName`/`uploaderSlug` are the
 * author's public identity, never `media.owner` itself — same reason
 * `SitePost.author` is a name, not a `users` document.
 */
export type SiteRaceEditionPhoto = SiteImage & {
  id: number;
  alt: string;
  /** `media.description` — the caption, distinct from `alt`. */
  description?: string;
  uploaderName?: string;
  uploaderSlug?: string;
};

export type SiteGallery = {
  slug: string;
  name: string;
  location?: string | null;
  created: string;
  eventDate?: string | null;
  isFeatured: boolean;
  /** Legacy OG helper: filename stems marked featured on images */
  featured: string[];
  cover?: SiteImage | null;
  /**
   * The album, as one ordered list.
   *
   * Was `images: SitePhoto[]` and `videos: SiteVideo[]`. Those two came from
   * one table with one `_order` — `galleries_items`, which the migration in
   * #95 created precisely because "ordering cannot be expressed across two
   * tables" — and mapPayloadGallery split them apart again on the way out. A
   * curator who arranged video, photo, photo, video got video, video, photo,
   * photo: the relative order inside each half survived, the interleaving did
   * not. The schema could express something no page could render.
   *
   * Derive the halves with `photosOf` / `videosOf` in src/lib/media/
   * gallery-items.ts where a caller genuinely wants one of them (counts, the
   * OG image, the featured shelf). Anything laying the album out should walk
   * this list instead.
   */
  items: SiteMediaItem[];
};

/**
 * One album as the index renders it, and nothing more.
 *
 * /gallery used to receive every album with every one of its `items`, and the
 * client then reduced that to a shelf. Measured on the seeded corpus, the page
 * carried each photo twice — 820 `blurDataURL`s and 840 `createdAt`s for ~420
 * photos — because the same rows arrive once inside an album and once in the
 * flat wall. The albums view only ever draws a cover, a name and two counts,
 * so that is what it is sent; the contents live one click away at
 * /gallery/[slug], which queries them itself.
 */
export type SiteAlbumCard = {
  slug: string;
  name: string;
  cover?: SiteImage | null;
  photoCount: number;
  videoCount: number;
  /** Sort key for the shelf — the album's own createdAt, or its newest media. */
  created: string;
};

export type SitePost = {
  id: number;
  title: string;
  slug: string;
  slugAsParams: string;
  description: string;
  date?: string;
  published: boolean;
  featured: boolean;
  author?: string;
  authorSlug?: string;
  image?: SiteImage;
  /**
   * Set when this post is a race report. Absent on an ordinary post.
   *
   * The relationship is one-way and optional in both directions: a member
   * can hold a badge with no post behind it (a race they ran but never
   * wrote up), and most posts are not race reports at all. What is NOT
   * possible is a race report with no badge — the report is defined by
   * pointing at a record, and a record always has an event, a distance and
   * a year, which is exactly what a badge needs.
   */
  race?: SiteRaceRecord;
  /** Only the detail query selects the body; card queries leave it undefined. */
  content?: import("@/payload-types").Post["content"];
};

/**
 * A member as the public site sees them.
 *
 * Sourced from `authors`, never `users`: the byline is the public identity,
 * while `users` carries email, role and invite state. Nothing here is
 * derived from a `users` document.
 */
export type SiteRaceRecord = {
  distanceId: string;
  eventId: string;
  id: number;
  year: number;
};

/**
 * A dated race edition as the public schedule sees it.
 *
 * DATES ARE STRINGS, "YYYY-MM-DD", not `Date`. Payload stores a full ISO
 * UTC timestamp; `mapRaceScheduleEntry` truncates it once and nothing
 * downstream parses it back. A `Date` would be rendered in the visitor's
 * local timezone, which puts a race stored as 2026-08-28T00:00:00.000Z on
 * 8/27 in the Americas and 8/28 in Taipei — the same row in two different
 * calendar cells for two people.
 *
 * `sourceUrl` and `verifiedAt` are deliberately absent: they are
 * maintenance metadata for the admin panel and the daily audit job, and no
 * visitor-facing component has any use for them.
 */
export type SiteRaceScheduleEntry = {
  id: number;
  name: string;
  nameZh?: string;
  series: RaceSeries;
  startDate: string;
  endDate?: string;
  eventId?: string;
  country?: string;
  location?: string;
  distanceSummary?: string;
  url?: string;
  registrationOpensAt?: string;
  registrationClosesAt?: string;
  registrationUrl?: string;
  registrationType: "first-come" | "lottery" | "qualifier" | "invitational";
  registrationStatusOverride?: "full" | "waitlist" | "cancelled" | "tba";
  notes?: string;
  /**
   * Which lottery this race's entries qualify for, by category label.
   *
   * Labels rather than booleans because the tag has to name *which* entry
   * qualifies: at Mont-Blanc the UTMB and CCC do and the OCC does not, and
   * a bare `wser: true` on the row would tell a visitor the OCC counts.
   * Absent, not `{}`, when the race is on neither list.
   */
  qualifiers?: RaceQualifiers;
};

export type SiteRider = {
  slug: string;
  name: string;
  bio?: string;
  avatar?: SiteImage;
  postCount: number;
  races: SiteRaceRecord[];
};

export type SiteGlobals = {
  heroTitleEn: string;
  heroTitleZh: string;
  metadata: {
    titleDefault: string;
    titleTemplate: string;
    description: string;
  };
  social: {
    github?: string | null;
  };
  topNavItems: { label: string; href: string; icon?: string | null }[];
};
