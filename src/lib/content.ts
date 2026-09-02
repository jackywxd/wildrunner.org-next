import type {
  Author,
  AuthorsSelect,
  GalleriesSelect,
  Media,
  MediaSelect,
  Post,
  PostsSelect,
  RaceCategory,
  RaceEdition,
  RaceEditionsSelect,
  RaceEvent,
  RaceRecord,
  Site as SiteGlobal,
} from "@/payload-types";
import { mediaDimensions, mediaImageSrc } from "@/lib/cf-image";
import { photosOf, videosOf } from "@/lib/media/gallery-items";
import {
  isMedia,
  mapGalleryVideo,
  mapMediaToPhoto,
  mapMediaToSiteImage,
  mapPayloadGallery,
} from "@/lib/media/gallery-mapping";
import { parseRaceGallerySlug, raceGallerySlug } from "@/lib/race-gallery";
import type {
  SiteGallery,
  SiteGlobals,
  SiteMediaItem,
  SitePhoto,
  SitePost,
  SiteRaceEditionDetail,
  SiteRaceEditionOption,
  SiteRaceEditionPhoto,
  SiteRaceRecord,
  SiteRaceScheduleEntry,
  SiteRider,
  SiteVideo,
} from "@/lib/content-types";
import { postSlugParams } from "@/lib/content-paths";
import { getPayloadClient } from "@/lib/payload";
import { scheduleWindow, toDateString } from "@/lib/races/calendar";
import { qualifiersFor } from "@/lib/races/qualifiers";
import { isFinished } from "@/lib/races/race-state";
import { cache } from "react";

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
  items: true,
  location: true,
  name: true,
  slug: true,
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
 * `race-editions` has no `owner` field, so there is no PII to omit — the
 * select is here anyway to keep the convention uniform. If a relationship
 * to `users` is ever added to this collection, the default would otherwise
 * be to leak it, and that default is exactly what the note at the top of
 * this file exists to prevent.
 *
 * `sourceUrl` and `verifiedAt` are omitted on purpose: maintenance
 * metadata, of no use to any visitor-facing component. `event` stays a bare
 * id (depth 0) — `raceEventCatalogue()` resolves it, so this select never
 * grows into the populate `RACE_RECORD_SELECT` at the top of this file
 * warns against.
 */
const RACE_EDITIONS_SELECT = {
  endDate: true,
  event: true,
  location: true,
  nameOverride: true,
  notes: true,
  registrationClosesAt: true,
  registrationOpensAt: true,
  registrationStatusOverride: true,
  registrationType: true,
  registrationUrl: true,
  startDate: true,
  url: true,
} as const satisfies RaceEditionsSelect<true>;

/** Payload gives back `null` for an empty field; the site type wants `undefined`. */
const orUndefined = <T>(value: T | null | undefined): T | undefined =>
  value ?? undefined;

/**
 * `race-events` joined with `race-categories`, loaded once per request.
 *
 * An edition carries only its own dates and registration window — name,
 * series, country live on the event, and the distance list lives on the
 * event's categories. Rendering a page of editions needs both for every
 * row, so this batches them the same way `raceRecordsByAuthorId` batches
 * accounts and records: two queries total, not two per edition. Both
 * collections are public reference data with no `owner` field (see the
 * headers of RaceEvents.ts / RaceCategories.ts), so there is no depth/PII
 * concern here the way there is for `posts.raceRecord`.
 */
async function raceEventCatalogue(): Promise<{
  events: Map<number, RaceEvent>;
  categoriesByEvent: Map<number, RaceCategory[]>;
}> {
  const payload = await getPayloadClient();

  const [eventsResult, categoriesResult] = await Promise.all([
    payload.find({
      collection: "race-events",
      depth: 0,
      limit: 0,
      pagination: false,
    }),
    payload.find({
      collection: "race-categories",
      depth: 0,
      limit: 0,
      pagination: false,
      // Longest first, matching the event's own listing — carried straight
      // into `distanceSummaryFor`, which does not re-sort.
      sort: "order",
    }),
  ]);

  const events = new Map(eventsResult.docs.map((event) => [event.id, event]));

  const categoriesByEvent = new Map<number, RaceCategory[]>();
  for (const category of categoriesResult.docs) {
    const eventId =
      typeof category.event === "number" ? category.event : category.event.id;
    const list = categoriesByEvent.get(eventId) ?? [];
    list.push(category);
    categoriesByEvent.set(eventId, list);
  }

  return { events, categoriesByEvent };
}

/** "UTMB / CCC / OCC / TDS", in the order `race-categories.order` gives them. */
function distanceSummaryFor(categories: RaceCategory[] | undefined): string | undefined {
  if (!categories || categories.length === 0) return undefined;
  return categories.map((category) => category.label).join(" / ");
}

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
 *
 * Returns `undefined`, not a throw, for an edition whose event cannot be
 * resolved. `race-events`/`race-categories` both require the relationship
 * at the schema level, so this should not happen — but a stale row from a
 * deleted event taking the whole page down for every other, healthy row
 * would be a worse failure than that one row silently not appearing.
 */
function mapRaceEditionEntry(
  doc: RaceEdition,
  events: Map<number, RaceEvent>,
  categoriesByEvent: Map<number, RaceCategory[]>,
): SiteRaceScheduleEntry | undefined {
  const eventId = typeof doc.event === "number" ? doc.event : doc.event.id;
  const event = events.get(eventId);
  if (!event) return undefined;

  const day = (value: string | null | undefined): string | undefined =>
    value ? value.slice(0, 10) : undefined;

  const categories = categoriesByEvent.get(eventId);

  return {
    country: orUndefined(event.country),
    distanceSummary: distanceSummaryFor(categories),
    endDate: day(doc.endDate),
    eventId: event.key,
    id: doc.id,
    location: orUndefined(doc.location),
    // Only where the published name differed from what the event is called
    // now — see RaceEditions.ts on `nameOverride`.
    name: orUndefined(doc.nameOverride) ?? event.name,
    nameZh: orUndefined(event.nameZh),
    notes: orUndefined(doc.notes),
    // Free: `raceEventCatalogue` already loaded every category, and
    // `distanceSummaryFor` above already walks this same list. No extra
    // query, no `select` to widen, no second round-trip.
    qualifiers: qualifiersFor(categories),
    registrationClosesAt: day(doc.registrationClosesAt),
    registrationOpensAt: day(doc.registrationOpensAt),
    registrationStatusOverride: orUndefined(doc.registrationStatusOverride),
    registrationType: doc.registrationType ?? "first-come",
    registrationUrl: orUndefined(doc.registrationUrl),
    series: event.series,
    // `startDate` is filtered to `exists: true` at both call sites, so this
    // branch always produces a value for a row that reaches here.
    startDate: day(doc.startDate) ?? "",
    // The edition's own page, if it published one; otherwise the event's
    // standing site. RaceEditions.ts: "Only if this edition has its own
    // page. The event's own website lives on the event."
    url: orUndefined(doc.url) ?? orUndefined(event.website),
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
 *
 * `startDate: { exists: true }` excludes a historical edition nobody has
 * dates for (RaceEditions.ts) — it exists only so a member's record can
 * point at it, and has no date to fall inside any window.
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

  const [result, { events, categoriesByEvent }] = await Promise.all([
    payload.find({
      collection: "race-editions",
      depth: 0,
      select: RACE_EDITIONS_SELECT,
      limit: 0,
      pagination: false,
      sort: "startDate",
      where: {
        and: [
          { startDate: { exists: true } },
          { startDate: { greater_than_equal: `${from}T00:00:00.000Z` } },
          { startDate: { less_than: `${to}T00:00:00.000Z` } },
        ],
      },
    }),
    raceEventCatalogue(),
  ]);

  return result.docs
    .map((doc) => mapRaceEditionEntry(doc as RaceEdition, events, categoriesByEvent))
    .filter((entry): entry is SiteRaceScheduleEntry => entry !== undefined);
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
 *
 * READS `race-editions`, NOT `race-schedule`. It used to read the latter,
 * and the two had quietly diverged: `race-schedule` is 18 hand-typed rows
 * from `seed-race-schedule.ts` that nothing keeps in sync, while
 * `race-editions` is the CSV AGENTS.md calls "the only one meant to be
 * refreshed regularly" (77+ rows in the seeded corpus). `getUpcomingRaces`
 * — what decides whether `/races` even offers 「紀錄比賽」 for a race — already
 * reads `race-editions`. Reading a different, smaller table here meant the
 * button could invite a member to report a race (e.g. `other-fat-dog/2026`)
 * that this picker then had no option for at all: `NewRaceReportPage`'s
 * `(eventId, year)` preselect match came back empty against `race-schedule`,
 * and the member landed on a picker whose list didn't contain the race the
 * button promised — a broken link dressed as a "graceful" empty preselect.
 * R-DUPLICATE (e2e/journeys/race-report.spec.ts) caught this as a timeout
 * waiting for a distance option that was never going to appear, because no
 * race — not even the requested one — had been chosen.
 *
 * Safe to read the same table `getUpcomingRaces` does: `scheduleId` below
 * (see `RaceReportOption`/`StartRaceReport.tsx`) is only ever used as an
 * opaque client-side selection key, matched back to `options` by array
 * search — never sent to the server. What a report actually persists is
 * `eventId` + `year` + `distanceId` (`ensureRaceRecord`), so which table's
 * row id fills this field has no bearing on what gets written.
 */
export async function getFinishedRaces(
  now: Date,
): Promise<SiteRaceScheduleEntry[]> {
  const today = toDateString(now);

  const [result, { events, categoriesByEvent }] = await Promise.all([
    (await getPayloadClient()).find({
      collection: "race-editions",
      depth: 0,
      select: RACE_EDITIONS_SELECT,
      limit: 0,
      pagination: false,
      // Most recent first: the race somebody is writing about is far more
      // often last month's than one from 2019.
      sort: "-startDate",
      where: {
        and: [
          { startDate: { exists: true } },
          { startDate: { less_than: `${today}T00:00:00.000Z` } },
        ],
      },
    }),
    raceEventCatalogue(),
  ]);

  return result.docs
    .map((doc) => mapRaceEditionEntry(doc as RaceEdition, events, categoriesByEvent))
    .filter((entry): entry is SiteRaceScheduleEntry => entry !== undefined)
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
 * to avoid loading the schedule twice per render. Both filtered to
 * `startDate: { exists: true }` for the same reason `getUpcomingRaces` is:
 * a dateless historical edition is not part of what this bounds, and
 * without the filter a `sort: "-startDate"` read has no guarantee a NULL
 * does not sort first.
 */
export async function getRaceScheduleBounds(): Promise<
  { first: string; last: string } | undefined
> {
  const payload = await getPayloadClient();

  const [earliest, latest] = await Promise.all([
    payload.find({
      collection: "race-editions",
      depth: 0,
      limit: 1,
      select: { startDate: true },
      sort: "startDate",
      where: { startDate: { exists: true } },
    }),
    payload.find({
      collection: "race-editions",
      depth: 0,
      limit: 1,
      select: { startDate: true },
      sort: "-startDate",
      where: { startDate: { exists: true } },
    }),
  ]);

  const first = earliest.docs[0] as Pick<RaceEdition, "startDate"> | undefined;
  const last = latest.docs[0] as Pick<RaceEdition, "startDate"> | undefined;
  if (!first?.startDate || !last?.startDate) return undefined;

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

/**
 * The media select for the public photo views.
 *
 * `owner` is deliberately absent, per this file's header: `media.owner` is a
 * relationship to `users`, and populating it would put an email and a live
 * session array behind every photo on the page.
 */
const GALLERY_MEDIA_SELECT = {
  blurDataURL: true,
  createdAt: true,
  description: true,
  filename: true,
  filesize: true,
  height: true,
  legacyVideoId: true,
  mimeType: true,
  posterUrl: true,
  raceEdition: true,
  streamId: true,
  streamReady: true,
  title: true,
  url: true,
  width: true,
} as const satisfies MediaSelect<true>;

/**
 * Every upload a member meant to be public, photos and videos together, once
 * per request.
 *
 * The predicate used to be `raceEdition exists`, and the comment here used to
 * defend that: tagging a race was read as "this member wants it public". It
 * was a category tag doing a publish switch's job, and it meant a member who
 * uploaded a photo without picking a race got a file that appeared nowhere —
 * and that src/lib/media/unused.ts would eventually delete for the same
 * reason. `media.usage` is the column that question actually needed; see its
 * header in src/collections/Media.ts.
 *
 * `React.cache`'d because /gallery asks three different questions of the same
 * rows — the albums shelf, the photo view, the video view — and used to run
 * this scan three times concurrently for them.
 *
 * It cannot be bounded by a `limit`: the page renders all of it, so truncating
 * would change what /gallery shows rather than just what it costs. What it can
 * be is read once and narrowed, which is what the `select` above is for. Note
 * that there is no `IN (...)` fan-out here despite what this comment used to
 * claim — `@payloadcms/drizzle`'s `selectDistinct` short-circuits when a query
 * has no joins, and both `usage` and the sort key are `media`'s own columns.
 * The row count is the thing to watch: on the seeded corpus this predicate
 * returns ~420 where `raceEdition exists` returned 0.
 */
const getGalleryMedia = cache(async () => {
  const payload = await getPayloadClient();
  // depth 0 keeps `owner` a bare id so it never reaches Payload's populate
  // step — the rule every other query in this file follows, and the reason
  // this file carries a header about PII at all.
  const result = await payload.find({
    collection: "media",
    depth: 0,
    limit: 0,
    pagination: false,
    select: GALLERY_MEDIA_SELECT,
    sort: "-createdAt",
    where: { usage: { equals: "gallery" } },
  });
  return result.docs;
});

export async function getGalleryPhotos(): Promise<SitePhoto[]> {
  const docs = await getGalleryMedia();
  const photos: SitePhoto[] = [];
  for (const doc of docs) {
    if (!doc.mimeType?.startsWith("image/")) continue;
    const photo = mapMediaToPhoto(doc, false);
    if (photo) photos.push(photo);
  }
  return photos;
}

/**
 * Every video tagged with a specific race edition — the video counterpart
 * to getRaceEditionPhotos, deliberately smaller in scope: no uploader
 * attribution (the race wall doesn't credit video uploaders either way
 * today) and no dedicated share-page id. `mapGalleryVideo`'s `videoId`
 * fallback (a filename-derived slug) is fine here precisely because
 * nothing resolves a video by that id outside a gallery's own
 * `videos[]` array — see /gallery/[slug]/v/[videoId] — so there is no
 * stable identifier to preserve.
 */
export async function getRaceEditionVideos(editionId: number): Promise<SiteVideo[]> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "media",
    depth: 0,
    limit: 0,
    pagination: false,
    sort: "-createdAt",
    select: GALLERY_MEDIA_SELECT,
    where: {
      and: [
        { raceEdition: { equals: editionId } },
        { mimeType: { like: "video" } },
        // The race wall and the virtual race album must return the same set:
        // src/lib/race-gallery.ts makes the album a re-run of this query, and
        // two different visibility rules is the split-brain it exists to avoid.
        { usage: { equals: "gallery" } },
      ],
    },
  });
  const videos: SiteVideo[] = [];
  for (const doc of result.docs) {
    const video = mapGalleryVideo(doc);
    if (video) videos.push(video);
  }
  return videos;
}

/** The video half of the same set — the counterpart to getGalleryPhotos. */
export async function getGalleryVideos(): Promise<SiteVideo[]> {
  const docs = await getGalleryMedia();
  const videos: SiteVideo[] = [];
  for (const doc of docs) {
    if (!doc.mimeType?.startsWith("video/")) continue;
    const video = mapGalleryVideo(doc);
    if (video) videos.push(video);
  }
  return videos;
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
  if (doc) return mapPayloadGallery(doc);

  // A stored gallery always wins, so a real row named `race-…-2026` keeps
  // working and this can never shadow one. Only when nothing is stored does
  // the slug get read as a race album — which is what makes both the album
  // page and the video share page work for race media without either of
  // them knowing virtual albums exist.
  return getRaceGalleryBySlug(slug);
}

/**
 * Find one video inside an album by the id in the URL.
 *
 * The media id is tried first because that is what identifies a video now: it
 * is the same in every album the file appears in, and it exists for a file in
 * no album at all (which is what /gallery/m/[mediaId] serves). `v.id` is the
 * older per-album identifier, kept working here — it resolves to
 * `media.legacyVideoId` or a filename slug via `mapGalleryVideo`.
 */
export function getGalleryVideo(
  gallery: SiteGallery,
  videoId: string,
): { gallery: SiteGallery; video: SiteVideo } | undefined {
  const decoded = decodeURIComponent(videoId);
  const videos = videosOf(gallery.items);
  const video =
    videos.find((v) => String(v.mediaId) === decoded) ??
    videos.find((v) => v.id === decoded || v.id === videoId);
  if (!video) return undefined;
  return { gallery, video };
}

/**
 * One public photo or video by its media id, with no album around it.
 *
 * What /gallery/m/[mediaId] serves. A member's upload that is in no album and
 * carries no race tag had no shareable address before this route existed for
 * video: the share page resolved a video by looking it up inside a gallery,
 * so `GalleryVideos` rendered no share button for it at all. Unified across
 * both kinds rather than keeping a video-only lookup, because photos never
 * had an id-based lookup at all.
 *
 * `usage: 'gallery'` is not optional here. This is a Local API query
 * (`payload.find`), which defaults `overrideAccess: true` and bypasses
 * `mediaPublicRead` (src/access/index.ts) entirely — every id-based lookup in
 * this file has to carry the filter itself, or it is an oracle that resolves
 * any of the 568 rows in the table by guessing an id, private and attachment
 * files included. See Media.ts's header for the incident this filter exists
 * to prevent.
 */
export async function getGalleryMediaById(
  mediaId: number,
): Promise<SiteMediaItem | null> {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "media",
    depth: 0,
    limit: 1,
    select: GALLERY_MEDIA_SELECT,
    where: {
      and: [{ id: { equals: mediaId } }, { usage: { equals: "gallery" } }],
    },
  });
  const doc = result.docs[0];
  if (!doc) return null;
  if (doc.mimeType?.startsWith("image/")) {
    const photo = mapMediaToPhoto(doc, false);
    return photo ? { kind: "photo", ...photo } : null;
  }
  const video = mapGalleryVideo(doc, String(doc.id));
  return video ? { kind: "video", ...video } : null;
}

/**
 * Every race that has media, as an album a reader can open and share.
 *
 * Virtual: nothing is stored. See `src/lib/race-gallery.ts` for why the
 * album is derived from the tag rather than kept as a `galleries` row.
 *
 * Two queries, not two per race. The obvious shape — walk the editions and
 * ask each one for its photos and videos — is 154 round trips against the
 * current catalogue to find the two races that actually have anything.
 * Instead: one pass over the tagged media, one over the editions it names,
 * then group in memory.
 *
 * THE MEDIA DECIDES WHICH EDITIONS TO LOOK UP, and it did not used to. This
 * began with `getRaceEditionOptions(now)` — every edition with a start date
 * in the past — used as a whitelist: a media row whose edition was not in
 * that list was skipped. Which quietly meant *an album only existed for a
 * race somebody had dated*. `race-editions.startDate` is optional precisely
 * so history can be carried (RaceEditions.ts), and the rows a member's claim
 * find-or-creates have no date at all — so a photo tagged with the 2019 UTMB
 * was dropped here, with nothing on screen to say so. Asking by id instead
 * is also the cheaper query: the editions actually referenced are a handful,
 * where the whitelist was 154 rows fetched to intersect.
 */
export async function getRaceGalleries(): Promise<SiteGallery[]> {
  const docs = await getGalleryMedia();
  const editions = await getGalleryRaceEditions();
  if (editions.length === 0) return [];

  const byId = new Map(editions.map((edition) => [edition.id, edition]));

  const grouped = new Map<number, SiteMediaItem[]>();
  for (const doc of docs) {
    const editionId =
      typeof doc.raceEdition === "number"
        ? doc.raceEdition
        : doc.raceEdition?.id;
    if (editionId === undefined || !byId.has(editionId)) continue;

    const bucket = grouped.get(editionId) ?? [];
    if (doc.mimeType?.startsWith("video/")) {
      // The media id as the share id — see buildRaceGallery.
      const video = mapGalleryVideo(doc, String(doc.id));
      if (video) bucket.push({ kind: "video", ...video });
    } else if (doc.mimeType?.startsWith("image/")) {
      const photo = mapMediaToPhoto(doc, false);
      if (photo) bucket.push({ kind: "photo", ...photo });
    }
    grouped.set(editionId, bucket);
  }

  const galleries: SiteGallery[] = [];
  for (const [editionId, items] of grouped) {
    if (items.length === 0) continue;
    galleries.push(buildRaceGallery(byId.get(editionId)!, items));
  }
  return galleries;
}

/**
 * Every race the public media points at, named.
 *
 * `React.cache`'d because one request asks twice — `getRaceGalleries` builds
 * the virtual albums from it, and `buildGalleryIndex` labels the 賽事 filter
 * from it — and those two must agree in any case: a race with an album and no
 * filter option, or the reverse, is a filter that lies about the shelf it
 * sits above.
 */
export const getGalleryRaceEditions = cache(
  async (): Promise<SiteRaceEditionOption[]> => {
    const docs = await getGalleryMedia();
    const ids = [
      ...new Set(
        docs
          .map((doc) =>
            typeof doc.raceEdition === "number" ? doc.raceEdition : doc.raceEdition?.id,
          )
          .filter((id): id is number => typeof id === "number"),
      ),
    ];
    return getRaceEditionsByIds(ids);
  },
);

/**
 * One race's album, or null when that race has no media.
 *
 * Delegates to `getRaceGalleries` rather than re-querying this one race.
 * The point is not brevity: it means the album at `/gallery/<slug>` is
 * built by exactly the code that built the card on `/gallery`, so the two
 * cannot disagree about what is in it. Re-deriving it here would recreate,
 * inside one feature, the split-brain this whole design avoids. The set is
 * small — the query is `raceEdition exists`, which is only the tagged media.
 */
export async function getRaceGalleryBySlug(
  slug: string,
): Promise<SiteGallery | null> {
  if (!parseRaceGallerySlug(slug)) return null;
  const galleries = await getRaceGalleries();
  return galleries.find((gallery) => gallery.slug === slug) ?? null;
}

/**
 * `videos[].id` is the media id, not the filename-derived slug
 * `mapGalleryVideo` falls back to.
 *
 * That fallback's own comment explains it was safe "precisely because
 * nothing resolves a video by that id outside a gallery's own videos[]
 * array". A virtual album breaks that premise — `/gallery/[slug]/v/[videoId]`
 * now resolves race videos this way — so the id has to be something that
 * cannot collide between two videos of the same race and does not change
 * when a file is renamed.
 */
function buildRaceGallery(
  edition: SiteRaceEditionOption,
  items: SiteMediaItem[],
): SiteGallery {
  // A race album has no curator, so `items` inherits the order of the query it
  // was built from — getGalleryMedia sorts `-createdAt` — and photos and
  // videos are already interleaved by date rather than segregated.
  const photos = photosOf(items);
  // Newest media stands in for the album's date: an edition option carries
  // no start date, and this only has to place the album in a list sorted on
  // `created` (gallery-page-client.tsx).
  const newest = items[0]?.createdAt ?? new Date(0).toISOString();
  // The cover has to be an image, so it is the first photo rather than the
  // first item — a race whose newest upload is a video still gets a picture.
  const first = photos[0];

  return {
    cover: first
      ? { src: first.src, width: first.width, height: first.height }
      : null,
    created: newest,
    eventDate: null,
    featured: [],
    isFeatured: false,
    items,
    name: `${edition.nameZh ?? edition.name} ${edition.year}`,
    slug: raceGallerySlug(edition.eventKey, edition.year),
  };
}

/**
 * The editions a set of media rows point at, named for the album builder.
 *
 * REPLACES `getRaceEditionOptions`, which asked "every edition that has
 * already started" and was doing two jobs it only fitted one of. As the
 * media library's picker it was wrong — 14 rows, nothing older than this
 * year, so the 2019 UTMB could not be named at all; that question now goes
 * to the catalogue (src/endpoints/resolveRaceEdition.ts). As the album
 * whitelist it was worse than wrong, because it failed silently: see
 * `getRaceGalleries`.
 *
 * NO DATE CONDITION, deliberately. `startDate` is optional exactly so a
 * historical edition can exist with a year and nothing else (RaceEditions.ts),
 * and the rows a member's claim find-or-creates are precisely those. Asking
 * by id is also the narrow query — a handful of editions rather than 154
 * fetched to intersect.
 *
 * Depth 1 to get each event's `key` and name; `race-events` carries no PII
 * (RaceEvents.ts), so this is safe at that depth the way `posts.raceRecord`
 * is not.
 */
export async function getRaceEditionsByIds(
  ids: number[],
): Promise<SiteRaceEditionOption[]> {
  if (ids.length === 0) return [];
  const payload = await getPayloadClient();

  const result = await payload.find({
    collection: "race-editions",
    depth: 1,
    limit: 0,
    pagination: false,
    sort: "-year",
    where: { id: { in: ids } },
  });

  const options: SiteRaceEditionOption[] = [];
  for (const doc of result.docs) {
    const event = typeof doc.event === "object" ? doc.event : undefined;
    if (!event) continue;
    options.push({
      id: doc.id,
      eventKey: event.key,
      name: orUndefined(doc.nameOverride) ?? event.name,
      nameZh: orUndefined(event.nameZh),
      year: doc.year,
    });
  }
  return options;
}

/**
 * One edition, by the event's stable `key` and its year — the pair
 * `/races/[key]/[year]` addresses, chosen for the same reason
 * `RaceEvents.ts` keeps `key` alongside the integer id: it is stable across
 * environments and immune to a row being recreated, so a shared link stays
 * correct.
 */
export async function getRaceEditionDetail(
  eventKey: string,
  year: number,
): Promise<SiteRaceEditionDetail | null> {
  const payload = await getPayloadClient();

  const events = await payload.find({
    collection: "race-events",
    depth: 0,
    limit: 1,
    where: { key: { equals: eventKey } },
  });
  const event = events.docs[0] as RaceEvent | undefined;
  if (!event) return null;

  const [editions, categories] = await Promise.all([
    payload.find({
      collection: "race-editions",
      depth: 0,
      limit: 1,
      where: { and: [{ event: { equals: event.id } }, { year: { equals: year } }] },
    }),
    payload.find({
      collection: "race-categories",
      depth: 0,
      limit: 0,
      pagination: false,
      sort: "order",
      where: { event: { equals: event.id } },
    }),
  ]);
  const edition = editions.docs[0] as RaceEdition | undefined;
  if (!edition) return null;

  const day = (value: string | null | undefined): string | undefined =>
    value ? value.slice(0, 10) : undefined;
  const distanceSummary = categories.docs.length
    ? (categories.docs as RaceCategory[]).map((category) => category.label).join(" / ")
    : undefined;

  return {
    id: edition.id,
    eventKey: event.key,
    name: orUndefined(edition.nameOverride) ?? event.name,
    nameZh: orUndefined(event.nameZh),
    series: event.series,
    country: orUndefined(event.country),
    year: edition.year,
    startDate: day(edition.startDate),
    endDate: day(edition.endDate),
    location: orUndefined(edition.location),
    url: orUndefined(edition.url) ?? orUndefined(event.website),
    distanceSummary,
  };
}

/**
 * Every photo tagged with one edition, newest first.
 *
 * `owner` is resolved to the uploader's public author identity exactly the
 * way `raceRecordsByAuthorId` resolves one for badges — never a bare
 * `users` id past this function, and `media` itself is fetched at depth 0
 * so `owner` never even reaches Payload's populate step. What keeps this wall
 * public is the `where` below, not the access layer — see the note on the
 * query.
 */
export async function getRaceEditionPhotos(
  editionId: number,
): Promise<SiteRaceEditionPhoto[]> {
  const payload = await getPayloadClient();

  // No `overrideAccess`, and it does NOT mean what the comment here used to
  // claim. The Local API's default is `overrideAccess: true`
  // (node_modules/payload/dist/collections/operations/local/find.js), so this
  // is not evaluated as an anonymous request and Media's read rule is not
  // consulted — the `usage` condition in the `where` below is what makes this
  // a public wall, not the access layer. src/lib/members/data.ts had it right
  // and this file had it backwards; the difference matters because it decides
  // whether tightening a read rule changes what the public site shows.
  const result = await payload.find({
    collection: "media",
    depth: 0,
    limit: 0,
    pagination: false,
    sort: "-createdAt",
    where: {
      and: [
        { raceEdition: { equals: editionId } },
        { mimeType: { like: "image" } },
        // Same reason as getRaceEditionVideos: this query and the virtual
        // album at /gallery/race-<key>-<year> have to agree.
        { usage: { equals: "gallery" } },
      ],
    },
  });

  const ownerIds = [
    ...new Set(
      result.docs
        .map((doc) => (typeof doc.owner === "number" ? doc.owner : undefined))
        .filter((id): id is number => id !== undefined),
    ),
  ];

  const authorByOwner = new Map<number, { name: string; slug: string }>();
  if (ownerIds.length > 0) {
    const [accounts, authors] = await Promise.all([
      payload.find({
        collection: "users",
        depth: 0,
        limit: 0,
        pagination: false,
        select: { author: true },
        where: { id: { in: ownerIds } },
      }),
      payload.find({
        collection: "authors",
        depth: 0,
        limit: 0,
        pagination: false,
        select: { name: true, slug: true },
      }),
    ]);
    const authorById = new Map(authors.docs.map((a) => [a.id, a]));
    for (const account of accounts.docs) {
      const authorId =
        typeof account.author === "number" ? account.author : undefined;
      const author = authorId !== undefined ? authorById.get(authorId) : undefined;
      if (author) authorByOwner.set(account.id, author);
    }
  }

  const photos: SiteRaceEditionPhoto[] = [];
  for (const doc of result.docs as Media[]) {
    const src = mediaImageSrc(doc);
    if (!src) continue;
    const { width, height } = mediaDimensions(doc);
    const ownerId = typeof doc.owner === "number" ? doc.owner : undefined;
    const author = ownerId !== undefined ? authorByOwner.get(ownerId) : undefined;
    photos.push({
      id: doc.id,
      src,
      width,
      height,
      blurDataURL: doc.blurDataURL ?? undefined,
      alt: doc.alt,
      description: doc.description ?? undefined,
      uploaderName: author?.name,
      uploaderSlug: author?.slug,
    });
  }
  return photos;
}
