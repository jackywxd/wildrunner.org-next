import type {
  Author,
  AuthorsSelect,
  GalleriesSelect,
  Gallery,
  Media,
  Post,
  PostsSelect,
  RaceRecord,
  RaceSchedule,
  RaceScheduleSelect,
  Site as SiteGlobal,
} from "@/payload-types";
import { mediaDimensions, mediaImageSrc } from "@/lib/cf-image";
import type {
  SiteGallery,
  SiteGlobals,
  SitePhoto,
  SitePost,
  SiteRaceRecord,
  SiteRaceScheduleEntry,
  SiteRider,
  SiteVideo,
} from "@/lib/content-types";
import { postSlugParams } from "@/lib/content-paths";
import { getPayloadClient } from "@/lib/payload";
import { scheduleWindow, toDateString } from "@/lib/races/calendar";
import { isFinished } from "@/lib/races/race-state";
import { videoIdFromFilename } from "@/lib/videoId";

/**
 * Fetch only the fields the public pages render.
 *
 * `owner` is deliberately absent from every select here, and that omission is
 * the point: `posts.owner`, `galleries.owner`, `media.owner` and
 * `authors.owner` are all relationships to `users`, so at any depth >= 1
 * Payload populates the whole account record — email, role,
 * invitePending/invitedAt/invitedBy, storageQuotaMb and the live `sessions`
 * array with session ids and expiry — behind every card on the page. Nothing
 * on the public site reads it, but Next's dev-mode server-IO instrumentation
 * writes raw `find()` results into the RSC stream, so that document lands in
 * the page HTML. Production builds omit that instrumentation (verified
 * against wildrunner.org: no `BasePayload`, no `email`, no `sessions` in the
 * markup), so this was never live — but not fetching PII is the durable fix
 * rather than trusting a build flag. `e2e/public/posts.spec.ts` P2-T12 and
 * `e2e/public/riders.spec.ts` R-T6 assert the page HTML stays clean.
 *
 * `content` is absent for a plainer reason: no card grid renders a post body,
 * so fetching up to 500 Lexical trees to build one is pure waste. Only the
 * post detail query asks for it, via POST_DETAIL_SELECT.
 */
const POST_CARD_SELECT = {
  author: true,
  createdAt: true,
  description: true,
  featured: true,
  image: true,
  publishedAt: true,
  slug: true,
  title: true,
  _status: true,
} as const satisfies PostsSelect<true>;

/**
 * `raceRecord` is on the detail query only. A card grid shows no badge, and
 * populating the relationship on 500 cards to render nothing is the same
 * waste `content` is kept out of POST_CARD_SELECT for.
 */
const POST_DETAIL_SELECT = {
  ...POST_CARD_SELECT,
  content: true,
  raceRecord: true,
} as const satisfies PostsSelect<true>;

const GALLERY_SELECT = {
  cover: true,
  createdAt: true,
  eventDate: true,
  featured: true,
  images: true,
  location: true,
  name: true,
  slug: true,
  videos: true,
} as const satisfies GalleriesSelect<true>;

/**
 * The fields `mapPayloadPost` reads. Narrower than `Post` so a `select`ed
 * query still typechecks; a full `Post` satisfies it structurally, so
 * existing callers are unaffected. `content` is optional because only
 * POST_DETAIL_SELECT returns it.
 */
type PostCardDoc = Pick<
  Post,
  | "author"
  | "createdAt"
  | "description"
  | "featured"
  | "id"
  | "image"
  | "publishedAt"
  | "slug"
  | "title"
  | "_status"
> & { content?: Post["content"]; raceRecord?: Post["raceRecord"] };

/** Exactly what GALLERY_SELECT returns — notably no `owner`. */
type GalleryDoc = Pick<
  Gallery,
  | "cover"
  | "createdAt"
  | "eventDate"
  | "featured"
  | "images"
  | "location"
  | "name"
  | "slug"
  | "videos"
>;

function isMedia(value: unknown): value is Media {
  return Boolean(value && typeof value === "object" && "url" in value);
}

function isAuthor(value: unknown): value is Author {
  return Boolean(value && typeof value === "object" && "name" in value);
}

/**
 * Populated relationship, or the bare id Payload leaves at depth 0.
 *
 * Keyed on `eventId` rather than on `typeof value === "object"`: the badge
 * needs event, distance and year together, and a shape missing any of them
 * would render a badge asserting something the record does not say.
 */
function isRaceRecord(value: unknown): value is RaceRecord {
  return Boolean(value && typeof value === "object" && "eventId" in value);
}

export function mapMediaToSiteImage(media: Media | null | undefined) {
  const src = mediaImageSrc(media);
  if (!src) return undefined;
  const { width, height } = mediaDimensions(media);
  return { src, width, height };
}

function mapMediaToPhoto(
  media: Media,
  featured: boolean,
): SitePhoto | null {
  const src = mediaImageSrc(media);
  if (!src) return null;
  const { width, height } = mediaDimensions(media);
  const filename = media.filename ?? src.split("/").pop() ?? "image";
  return {
    filename,
    src,
    slug: src,
    featured,
    width,
    height,
    blurDataURL: media.blurDataURL ?? undefined,
    blurWidth: 20,
    blurHeight: Math.max(1, Math.round((height / width) * 20)),
  };
}

function mapGalleryVideo(
  media: Media,
  videoId?: string | null,
): SiteVideo | null {
  const src = mediaImageSrc(media);
  if (!src) return null;
  const filename = media.filename ?? "video";
  const id = videoId?.trim() || videoIdFromFilename(filename);
  return {
    mediaId: media.id,
    id,
    filename,
    src,
    slug: filename,
    mimeType: media.mimeType ?? "video/mp4",
    size: media.filesize ?? undefined,
    extension: filename.includes(".")
      ? filename.split(".").pop()!
      : undefined,
    streamId: media.streamId,
    streamReady: Boolean(media.streamReady),
  };
}

export function mapPayloadGallery(doc: GalleryDoc): SiteGallery {
  const images: SitePhoto[] = [];
  const featuredStems: string[] = [];

  for (const row of doc.images ?? []) {
    const media = row.media;
    if (!isMedia(media)) continue;
    const photo = mapMediaToPhoto(media, Boolean(row.featured));
    if (!photo) continue;
    images.push(photo);
    if (row.featured) {
      featuredStems.push(photo.filename.replace(/\.[^.]+$/, ""));
    }
  }

  const videos: SiteVideo[] = [];
  for (const row of doc.videos ?? []) {
    const media = row.media;
    if (!isMedia(media)) continue;
    const video = mapGalleryVideo(media, row.videoId);
    if (video) videos.push(video);
  }

  const coverMedia = isMedia(doc.cover) ? doc.cover : undefined;

  return {
    slug: doc.slug,
    name: doc.name,
    location: doc.location,
    created: doc.createdAt,
    eventDate: doc.eventDate,
    isFeatured: Boolean(doc.featured),
    featured: featuredStems,
    cover: coverMedia ? mapMediaToSiteImage(coverMedia) : null,
    images,
    videos,
  };
}

export function mapPayloadPost(doc: PostCardDoc): SitePost {
  const author = isAuthor(doc.author) ? doc.author : undefined;
  const imageMedia = isMedia(doc.image) ? doc.image : undefined;
  const params = postSlugParams(doc.slug);

  return {
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    slugAsParams: params,
    description: doc.description,
    date: doc.publishedAt ?? doc.createdAt,
    published: doc._status === "published",
    featured: Boolean(doc.featured),
    author: author?.name,
    authorSlug: author?.slug,
    image: imageMedia ? mapMediaToSiteImage(imageMedia) : undefined,
    // A bare number here means the query ran at depth 0 or without
    // `raceRecord` selected — a card query. That is not a post with no
    // race, it is a question this query did not ask, so it maps to
    // undefined either way and no caller can tell them apart. Only the
    // detail page renders the badge, and it asks.
    race: isRaceRecord(doc.raceRecord) ? mapRaceRecord(doc.raceRecord) : undefined,
    content: doc.content,
  };
}

export function mapSiteGlobal(doc: SiteGlobal): SiteGlobals {
  return {
    heroTitleEn: doc.heroTitleEn ?? "Run wild, run free",
    heroTitleZh: doc.heroTitleZh ?? "心如野馬，馳騁天下",
    metadata: {
      titleDefault: doc.metadata?.titleDefault ?? "野馬營",
      titleTemplate: doc.metadata?.titleTemplate ?? "%s | 野馬營",
      description: doc.metadata?.description ?? "",
    },
    social: {
      github: doc.social?.github,
    },
    topNavItems: doc.topNavItems ?? [],
  };
}

const defaultGlobals: SiteGlobals = {
  heroTitleEn: "Run wild, run free",
  heroTitleZh: "心如野馬，馳騁天下",
  metadata: {
    titleDefault: "野馬營",
    titleTemplate: "%s | 野馬營",
    description: "",
  },
  social: {},
  topNavItems: [
    { label: "文章", href: "/posts", icon: "rss" },
    { label: "相册", href: "/gallery", icon: "image" },
    { label: "关于", href: "/about", icon: "about" },
  ],
};

export async function getSiteGlobals(): Promise<SiteGlobals> {
  const payload = await getPayloadClient();
  const site = await payload.findGlobal({
    slug: "site",
    depth: 0,
  });
  return site ? mapSiteGlobal(site) : defaultGlobals;
}

export async function getPublishedPosts(): Promise<SitePost[]> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "posts",
    // depth 1 populates `author` and `image`; their own `owner` fields stay
    // as bare ids because the depth budget is spent. depth 2 walked into
    // `authors.owner` and pulled back a full user account.
    depth: 1,
    select: POST_CARD_SELECT,
    limit: 500,
    sort: "-publishedAt",
    where: {
      _status: {
        equals: "published",
      },
    },
  });
  return result.docs.map(mapPayloadPost);
}

export async function getPostBySlugParam(
  slugParam: string,
): Promise<SitePost | null> {
  const payload = await getPayloadClient();
  const attempts = [
    slugParam,
    `posts/${slugParam}`,
    slugParam.replace(/^posts\//, ""),
  ];

  for (const slug of attempts) {
    const result = await payload.find({
      collection: "posts",
      depth: 1,
      select: POST_DETAIL_SELECT,
      limit: 1,
      where: {
        and: [
          { slug: { equals: slug } },
          { _status: { equals: "published" } },
        ],
      },
    });
    if (result.docs[0]) {
      return mapPayloadPost(result.docs[0]);
    }
  }
  return null;
}

export async function getPublishedPostSlugs(): Promise<string[]> {
  const posts = await getPublishedPosts();
  return posts.map((p) => p.slugAsParams);
}

/**
 * Published post counts per author, in one query instead of one per rider.
 *
 * `depth: 0` leaves `author` as the raw id, which is exactly what we key on.
 * Posts whose byline was never set (the Velite-era imports) have no author
 * and are simply absent from the map — they belong to nobody's page.
 */
async function publishedPostCountsByAuthor(): Promise<Map<number, number>> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "posts",
    depth: 0,
    limit: 0,
    pagination: false,
    where: { _status: { equals: "published" } },
  });

  const counts = new Map<number, number>();
  for (const post of result.docs) {
    const authorId = typeof post.author === "number" ? post.author : undefined;
    if (authorId === undefined) continue;
    counts.set(authorId, (counts.get(authorId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Fetch only the fields the public directory renders. Same reasoning as
 * POST_CARD_SELECT — `authors.owner` is the `users` relationship here.
 */
const RIDER_SELECT = {
  avatar: true,
  bio: true,
  name: true,
  slug: true,
} as const satisfies AuthorsSelect<true>;

/** Exactly what RIDER_SELECT returns — notably no `owner`. */
type RiderDoc = Pick<Author, "avatar" | "bio" | "id" | "name" | "slug">;

function mapPayloadAuthor(
  doc: RiderDoc,
  postCount: number,
  races: SiteRaceRecord[] = [],
): SiteRider {
  const avatarMedia = isMedia(doc.avatar) ? doc.avatar : undefined;
  return {
    slug: doc.slug,
    name: doc.name,
    bio: doc.bio ?? undefined,
    avatar: avatarMedia ? mapMediaToSiteImage(avatarMedia) : undefined,
    postCount,
    races,
  };
}

/**
 * Race records are owned by a *user*, while riders are keyed by author, so
 * the two have to be joined on something.
 *
 * That something is `users.author` — the byline an account claims as its
 * identity — and NOT `authors.owner`, which was the first attempt and was
 * wrong. `setOwner` stamps the creating user onto every author, so an author
 * an admin types into /admin is owned by that admin just as much as their
 * own is. One user therefore owns many authors, and joining on `owner`
 * attached the admin's races to every byline they had ever created. Observed
 * exactly that way: an author added in /admin turned up wearing the admin's
 * two badges.
 *
 * `users.author` is one-to-one by construction (`ensureAuthorIdentity` sets
 * it once, on account creation) and answers the right question — which
 * author is this account, rather than which authors did it make.
 */
const RACE_RECORD_SELECT = {
  distanceId: true,
  eventId: true,
  owner: true,
  year: true,
} as const;

function mapRaceRecord(doc: {
  distanceId: string;
  eventId: string;
  id: number;
  year: number;
}): SiteRaceRecord {
  return {
    distanceId: doc.distanceId,
    eventId: doc.eventId,
    id: doc.id,
    year: doc.year,
  };
}

/**
 * `race-schedule` has no `owner` field, so there is no PII to omit — the
 * select is here anyway to keep the convention uniform. If a relationship
 * to `users` is ever added to this collection, the default would otherwise
 * be to leak it, and that default is exactly what the note at the top of
 * this file exists to prevent.
 *
 * `sourceUrl` and `verifiedAt` are omitted on purpose: maintenance
 * metadata, of no use to any visitor-facing component.
 */
const RACE_SCHEDULE_SELECT = {
  country: true,
  distanceSummary: true,
  endDate: true,
  eventId: true,
  location: true,
  name: true,
  nameZh: true,
  notes: true,
  registrationClosesAt: true,
  registrationOpensAt: true,
  registrationStatusOverride: true,
  registrationType: true,
  registrationUrl: true,
  series: true,
  startDate: true,
  url: true,
} as const satisfies RaceScheduleSelect<true>;

/** Payload gives back `null` for an empty field; the site type wants `undefined`. */
const orUndefined = <T>(value: T | null | undefined): T | undefined =>
  value ?? undefined;

/**
 * THE TIMEZONE SEAM. Payload stores a `date` field as a full ISO UTC string
 * (`2026-08-28T00:00:00.000Z`). Everything downstream — the calendar grid,
 * the registration-window comparison, the month headings — works on
 * `"YYYY-MM-DD"` calendar strings, so the conversion happens exactly here
 * and a `Date` is never constructed from these values again.
 *
 * The alternative, passing the ISO string through and letting components
 * call `new Date(...)`, renders in the visitor's local timezone: a race on
 * 8/28 UTC lands in the 8/27 cell for anyone west of Greenwich. Two
 * visitors would see the same race on different days. The day-only picker
 * on the field keeps the stored value at midnight so this truncation is
 * lossless.
 */
function mapRaceScheduleEntry(doc: RaceSchedule): SiteRaceScheduleEntry {
  const day = (value: string | null | undefined): string | undefined =>
    value ? value.slice(0, 10) : undefined;

  return {
    country: orUndefined(doc.country),
    distanceSummary: orUndefined(doc.distanceSummary),
    endDate: day(doc.endDate),
    eventId: orUndefined(doc.eventId),
    id: doc.id,
    location: orUndefined(doc.location),
    name: doc.name,
    nameZh: orUndefined(doc.nameZh),
    notes: orUndefined(doc.notes),
    registrationClosesAt: day(doc.registrationClosesAt),
    registrationOpensAt: day(doc.registrationOpensAt),
    registrationStatusOverride: orUndefined(doc.registrationStatusOverride),
    registrationType: doc.registrationType ?? "first-come",
    registrationUrl: orUndefined(doc.registrationUrl),
    series: doc.series,
    // `startDate` is required, so this branch always produces a value.
    startDate: day(doc.startDate) ?? "",
    url: orUndefined(doc.url),
  };
}

/**
 * The races `/races` and the homepage teaser show: one `months`-long window,
 * starting at the anchor month or, with no anchor, at the current one.
 *
 * Still filtered on `startDate` rather than on an overlap with `endDate`,
 * but for a different reason than before. The old comment here justified it
 * with "upcoming is what the page promises", and noted that a three-day
 * event which began yesterday drops off today — which was the bug, not the
 * feature: a race still being run was removed from the schedule. Aligning
 * the window to the month fixes that case without an `or` clause, because a
 * race that started earlier this month is still inside this month's window.
 * What remains is a race spanning a *window* boundary, which is one click
 * back on the pager.
 *
 * The bounds are ISO `Z` strings, which order lexicographically in exactly
 * date order — that is why a text column indexes and compares correctly
 * here without any casting.
 */
export async function getUpcomingRaces(opts?: {
  now?: Date;
  months?: number;
  anchor?: string;
}): Promise<SiteRaceScheduleEntry[]> {
  const { from, to } = scheduleWindow(
    opts?.now ?? new Date(),
    opts?.months,
    opts?.anchor,
  );
  const payload = await getPayloadClient();

  const result = await payload.find({
    collection: "race-schedule",
    depth: 0,
    select: RACE_SCHEDULE_SELECT,
    limit: 0,
    pagination: false,
    sort: "startDate",
    where: {
      and: [
        { startDate: { greater_than_equal: `${from}T00:00:00.000Z` } },
        { startDate: { less_than: `${to}T00:00:00.000Z` } },
      ],
    },
  });

  return result.docs.map((doc) => mapRaceScheduleEntry(doc as RaceSchedule));
}

/**
 * Every race that has already been run — the set a member may write a
 * report about.
 *
 * Only finished races, because that is the rule the feature exists to
 * express: 只有過去的比賽可以寫賽記. A report on a race that has not happened
 * is not a report.
 *
 * NOT windowed by the pager's anchor, unlike `getUpcomingRaces`. The picker
 * is answering "which race is this post about", and the answer may be three
 * years back; paging it would hide older races behind a control the editor
 * does not have. The schedule is small enough (tens of rows) that fetching
 * all past ones is cheaper than the query that would avoid it.
 *
 * The bound is `startDate < today`, one day looser than `raceState`'s
 * `finished`. A race that started yesterday and ends tomorrow comes back
 * here and is filtered out by `isFinished` at the call site. Doing the exact
 * comparison in SQL would need `COALESCE(end_date, start_date)`, which
 * Payload's `where` cannot express — so the loose bound narrows the rows and
 * the shared helper decides, rather than the two disagreeing.
 */
export async function getFinishedRaces(
  now: Date,
): Promise<SiteRaceScheduleEntry[]> {
  const payload = await getPayloadClient();
  const today = toDateString(now);

  const result = await payload.find({
    collection: "race-schedule",
    depth: 0,
    select: RACE_SCHEDULE_SELECT,
    limit: 0,
    pagination: false,
    // Most recent first: the race somebody is writing about is far more
    // often last month's than one from 2019.
    sort: "-startDate",
    where: { startDate: { less_than: `${today}T00:00:00.000Z` } },
  });

  return result.docs
    .map((doc) => mapRaceScheduleEntry(doc as RaceSchedule))
    .filter((entry) => isFinished(entry, now));
}

/**
 * The first and last month any race falls in, or undefined when the
 * schedule is empty.
 *
 * The pager needs this for two reasons. A visitor should not be able to
 * click back through years of empty months looking for a schedule that
 * starts in 2026; and every one of those months would be a distinct
 * crawlable URL, so an unbounded pager quietly hands a crawler an infinite
 * space. Bounding it is what keeps `?from=` a finite set.
 *
 * Two ordered single-row reads rather than a full scan — the whole point is
 * to avoid loading the schedule twice per render.
 */
export async function getRaceScheduleBounds(): Promise<
  { first: string; last: string } | undefined
> {
  const payload = await getPayloadClient();

  const [earliest, latest] = await Promise.all([
    payload.find({
      collection: "race-schedule",
      depth: 0,
      limit: 1,
      select: { startDate: true },
      sort: "startDate",
    }),
    payload.find({
      collection: "race-schedule",
      depth: 0,
      limit: 1,
      select: { startDate: true },
      sort: "-startDate",
    }),
  ]);

  const first = earliest.docs[0] as RaceSchedule | undefined;
  const last = latest.docs[0] as RaceSchedule | undefined;
  if (!first || !last) return undefined;

  // Month precision only. Payload stores these as full ISO UTC timestamps
  // and the picker is dayOnly, so the leading "YYYY-MM" is the stored month
  // with no parsing — the same reason the rest of this file compares these
  // as strings rather than building a Date. See calendar.ts's header.
  return {
    first: String(first.startDate).slice(0, 7),
    last: String(last.startDate).slice(0, 7),
  };
}

/** Newest first, then by event, so badge order is stable across renders. */
function sortRaceRecords(records: SiteRaceRecord[]): SiteRaceRecord[] {
  return records.sort(
    (a, b) => b.year - a.year || a.eventId.localeCompare(b.eventId),
  );
}

/**
 * Every rider's race records, keyed by author id, in a fixed number of
 * queries.
 *
 * The per-rider alternative would be one query per author — 180 of them on
 * the current directory.
 *
 * Reading `users` here is safe despite D-T6: `select: { author: true }`
 * returns ids and nothing else, and only numbers ever leave this function.
 * The account document itself never reaches a component.
 */
async function raceRecordsByAuthorId(): Promise<Map<number, SiteRaceRecord[]>> {
  const payload = await getPayloadClient();

  const [accounts, records] = await Promise.all([
    payload.find({
      collection: "users",
      depth: 0,
      limit: 0,
      pagination: false,
      select: { author: true },
    }),
    payload.find({
      collection: "race-records",
      depth: 0,
      limit: 0,
      pagination: false,
      select: RACE_RECORD_SELECT,
    }),
  ]);

  const authorByUser = new Map<number, number>();
  for (const account of accounts.docs) {
    const author = account.author;
    // depth 0, so this is a bare id. Anything else means the select was
    // widened and a document is now in flight that has no business here.
    if (typeof author === "number") authorByUser.set(account.id, author);
  }

  const byAuthor = new Map<number, SiteRaceRecord[]>();
  for (const record of records.docs) {
    const owner = record.owner;
    const ownerId = typeof owner === "number" ? owner : undefined;
    if (ownerId === undefined) continue;

    const authorId = authorByUser.get(ownerId);
    // An owner with no author of its own belongs to nobody's page.
    if (authorId === undefined) continue;

    const list = byAuthor.get(authorId) ?? [];
    list.push(mapRaceRecord(record as Parameters<typeof mapRaceRecord>[0]));
    byAuthor.set(authorId, list);
  }

  for (const list of byAuthor.values()) sortRaceRecords(list);
  return byAuthor;
}

/**
 * Every member, for the public directory.
 *
 * Restricted to authors that have an `owner`, which is what separates a
 * member from a legacy byline: `ensureAuthorIdentity` gives every account an
 * author record on create, and `setOwner` stamps the owner — so an author
 * without one was imported, not registered, and has no member behind it.
 */
export async function getRiders(): Promise<SiteRider[]> {
  const payload = await getPayloadClient();
  const [result, counts, races] = await Promise.all([
    payload.find({
      collection: "authors",
      depth: 1,
      limit: 500,
      sort: "name",
      where: { owner: { exists: true } },
      select: RIDER_SELECT,
    }),
    publishedPostCountsByAuthor(),
    raceRecordsByAuthorId(),
  ]);

  return result.docs.map((doc) =>
    mapPayloadAuthor(doc, counts.get(doc.id) ?? 0, races.get(doc.id) ?? []),
  );
}

export async function getRiderBySlug(
  slug: string,
): Promise<{ posts: SitePost[]; rider: SiteRider } | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "authors",
    depth: 1,
    limit: 1,
    where: { and: [{ slug: { equals: slug } }, { owner: { exists: true } }] },
    select: RIDER_SELECT,
  });

  const doc = result.docs[0];
  if (!doc) return null;

  // Bylined posts only. Matching on `owner` instead would pull in the
  // ownerless imports and attribute them to whoever happens to own them in
  // the database, which is not what the public site credits them to.
  //
  // `depth: 1` populates the cover image and the byline and stops there.
  // Depth 2 would walk on to `author.owner` and pull the full user record in
  // behind it — see RIDER_SELECT.
  // "Which account claims this byline as its identity?" — not "who created
  // this author", which is what `authors.owner` answers and which attributes
  // an admin's races to every byline they ever added. See
  // `raceRecordsByAuthorId`. An author nobody claims (one typed into /admin)
  // matches no account here and correctly gets no badges.
  const [posts, claimedBy] = await Promise.all([
    payload.find({
      collection: "posts",
      depth: 1,
      limit: 500,
      sort: "-publishedAt",
      where: {
        and: [{ author: { equals: doc.id } }, { _status: { equals: "published" } }],
      },
      select: POST_CARD_SELECT,
    }),
    payload.find({
      collection: "users",
      depth: 0,
      limit: 1,
      pagination: false,
      where: { author: { equals: doc.id } },
      select: { author: true },
    }),
  ]);

  const ownerId = claimedBy.docs[0]?.id;
  const races =
    typeof ownerId === "number"
      ? await payload
          .find({
            collection: "race-records",
            depth: 0,
            limit: 0,
            pagination: false,
            where: { owner: { equals: ownerId } },
            select: RACE_RECORD_SELECT,
          })
          .then((result) =>
            sortRaceRecords(
              result.docs.map((record) =>
                mapRaceRecord(record as Parameters<typeof mapRaceRecord>[0]),
              ),
            ),
          )
      : [];

  return {
    posts: posts.docs.map(mapPayloadPost),
    rider: mapPayloadAuthor(doc, posts.totalDocs, races),
  };
}

export async function getRiderSlugs(): Promise<string[]> {
  const riders = await getRiders();
  return riders.map((r) => r.slug);
}

export async function getPublishedGalleries(): Promise<SiteGallery[]> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "galleries",
    // depth 1 populates cover/images[].media/videos[].media; each Media's own
    // `owner` stays a bare id. At depth 2 every one of them expanded to a user.
    depth: 1,
    select: GALLERY_SELECT,
    limit: 200,
    sort: "-createdAt",
    where: {
      _status: {
        equals: "published",
      },
    },
  });
  return result.docs.map(mapPayloadGallery);
}

export async function getGalleryBySlug(
  slug: string,
): Promise<SiteGallery | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "galleries",
    depth: 1,
    select: GALLERY_SELECT,
    limit: 1,
    where: {
      and: [{ slug: { equals: slug } }, { _status: { equals: "published" } }],
    },
  });
  const doc = result.docs[0];
  return doc ? mapPayloadGallery(doc) : null;
}

export function getGalleryVideo(
  gallery: SiteGallery,
  videoId: string,
): { gallery: SiteGallery; video: SiteVideo } | undefined {
  const decoded = decodeURIComponent(videoId);
  const video = gallery.videos.find(
    (v) => v.id === decoded || v.id === videoId,
  );
  if (!video) return undefined;
  return { gallery, video };
}
