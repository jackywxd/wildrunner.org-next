/** Public-site shapes decoupled from Velite and Payload document types. */

export type SiteImage = {
  src: string;
  width: number;
  height: number;
  blurDataURL?: string;
};

export type SitePhoto = SiteImage & {
  filename: string;
  slug: string;
  featured: boolean;
  blurWidth?: number;
  blurHeight?: number;
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
};

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
  series: "utmb" | "wtm" | "others";
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
  images: SitePhoto[];
  videos: SiteVideo[];
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
  series: "utmb" | "wtm" | "others";
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
