import { expect, test } from "@playwright/test";

import type {
  SiteGallery,
  SiteMediaItem,
  SitePhoto,
} from "@/lib/content-types";
import {
  albumCard,
  arrangeMedia,
  buildGalleryIndex,
  raceFilterOptions,
  wallPage,
  type WallCursor,
} from "@/lib/media/gallery-index";

/**
 * U-GALLERYINDEX — what /gallery is sent, and the one rule in it.
 *
 * The reduction moved out of the browser and into the server when the page
 * was cached: it is deterministic, and the input it reduced from was already
 * serialised into the payload, so four `useMemo`s were saving render time and
 * no bytes. Measured on the seeded corpus, /gallery went 678,792 -> 424,721
 * bytes and its `blurDataURL` count 820 -> 422 for ~420 photos, which is the
 * duplication ending.
 *
 * Most of that move is mechanical. The union is not, and it is the piece a
 * later simplification would take out first — "the wall is just the library,
 * why union anything" — so it gets its own case.
 */
const photo = (src: string, over: Partial<SitePhoto> = {}): SitePhoto => ({
  src,
  // Derived from `src` so two fixtures never silently share an id, which is
  // what would happen with a constant — and the id is the share address.
  mediaId: src.length,
  filename: src,
  slug: src,
  featured: false,
  width: 100,
  height: 100,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const album = (slug: string, items: SiteGallery["items"]): SiteGallery => ({
  slug,
  name: slug,
  created: "2026-01-01T00:00:00.000Z",
  isFeatured: false,
  featured: [],
  cover: null,
  items,
});

test.describe("U-GALLERYINDEX the wall is a union, not the library", () => {
  test("U-GALLERYINDEX-1: an album photo that is not on the wall still reaches the page", () => {
    // Album membership and `media.usage` are two independent routes to
    // "public". An editor can curate a file whose usage is `attachment`; it is
    // then in the album and absent from the library query. Sending only the
    // library would take it off the page it was curated onto.
    const curated = photo("curated.jpg");
    const index = buildGalleryIndex(
      [album("a", [{ kind: "photo", ...curated }])],
      [],
      [],
    );

    expect(index.items.map((item) => item.src)).toEqual(["curated.jpg"]);
  });

  test("U-GALLERYINDEX-2: a file reached by both routes appears once", () => {
    const both = photo("both.jpg");
    const index = buildGalleryIndex(
      [album("a", [{ kind: "photo", ...both }])],
      [both],
      [],
    );

    expect(index.items).toHaveLength(1);
  });

  test("U-GALLERYINDEX-3: a newer video outranks an older photo in the one list", () => {
    // The regression this whole grid exists for. While the wall was two lists
    // a video could only be ordered relative to other videos, so a member's
    // newest upload sat 24th behind every album video. One list means one
    // order, and the order is time — across both kinds.
    const older = photo("older.jpg", { createdAt: "2026-01-01T00:00:00.000Z" });
    const index = buildGalleryIndex(
      [],
      [older],
      [
        {
          mediaId: 9,
          id: "v9",
          filename: "newer.mp4",
          src: "newer.mp4",
          mimeType: "video/mp4",
          slug: "newer.mp4",
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    );

    expect(index.items.map((item) => [item.kind, item.src])).toEqual([
      ["video", "newer.mp4"],
      ["photo", "older.jpg"],
    ]);
  });

  test("U-GALLERYINDEX-4: a card counts both kinds and carries no contents", () => {
    const card = albumCard(
      album("a", [
        { kind: "photo", ...photo("p1.jpg") },
        { kind: "photo", ...photo("p2.jpg") },
        {
          kind: "video",
          mediaId: 1,
          id: "v1",
          filename: "v1.mp4",
          src: "v1.mp4",
          mimeType: "video/mp4",
          slug: "v1.mp4",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    );

    expect(card.photoCount).toBe(2);
    expect(card.videoCount).toBe(1);
    // The point of the card: no items on it. A regression that put them back
    // would restore the duplication the measurement above records.
    expect(Object.keys(card)).not.toContain("items");
  });

  test("U-GALLERYINDEX-5: an empty album is not carded", () => {
    expect(buildGalleryIndex([album("empty", [])], [], []).albums).toEqual([]);
  });

  test("U-GALLERYINDEX-6: two items sharing one createdAt still get one deterministic order", () => {
    // No secondary key before this, two rows with an identical `createdAt`
    // — a batch import, say — had no defined order at all. `newestFirst`
    // breaks the tie on `src`, which is what lets wallPage's cursor find an
    // exact, unambiguous position at a boundary like this one.
    const index = buildGalleryIndex([], [photo("z.jpg"), photo("a.jpg")], []);
    expect(index.items.map((item) => item.src)).toEqual(["a.jpg", "z.jpg"]);
  });
});

test.describe("U-WALLPAGE a page of the wall, sliced from the array buildGalleryIndex already produced", () => {
  const item = (src: string, createdAt: string): SiteMediaItem => ({
    kind: "photo",
    ...photo(src, { createdAt }),
  });

  // Newest first — the order buildGalleryIndex itself would hand wallPage.
  // wallPage does not sort; it only slices what it is given.
  const five = [
    item("e.jpg", "2026-01-05T00:00:00.000Z"),
    item("d.jpg", "2026-01-04T00:00:00.000Z"),
    item("c.jpg", "2026-01-03T00:00:00.000Z"),
    item("b.jpg", "2026-01-02T00:00:00.000Z"),
    item("a.jpg", "2026-01-01T00:00:00.000Z"),
  ];

  test("U-WALLPAGE-1: the first page stops at pageSize and points a cursor at its own last item", () => {
    const result = wallPage(five, null, 2);
    expect(result.items.map((i) => i.src)).toEqual(["e.jpg", "d.jpg"]);
    expect(result.nextCursor).toEqual({
      createdAt: "2026-01-04T00:00:00.000Z",
      src: "d.jpg",
    });
  });

  test("U-WALLPAGE-2: the returned cursor continues from exactly the next item — no skip, no repeat", () => {
    const first = wallPage(five, null, 2);
    const second = wallPage(five, first.nextCursor, 2);
    expect(second.items.map((i) => i.src)).toEqual(["c.jpg", "b.jpg"]);
  });

  test("U-WALLPAGE-3: the last page's cursor is null — nothing left to ask for", () => {
    const first = wallPage(five, null, 2);
    const second = wallPage(five, first.nextCursor, 2);
    const third = wallPage(five, second.nextCursor, 2);
    expect(third.items.map((i) => i.src)).toEqual(["a.jpg"]);
    expect(third.nextCursor).toBeNull();
  });

  test("U-WALLPAGE-4: fewer items than a page — everything comes back at once, no cursor", () => {
    const result = wallPage(five.slice(0, 2), null, 10);
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  test("U-WALLPAGE-5: a cursor whose own item was withdrawn since the last page still resumes at the right place", () => {
    // "d.jpg" was the previous page's boundary; by the time this request
    // lands, its owner has taken it off the wall. The array wallPage sees no
    // longer contains it at all — the exact case a plain offset gets wrong,
    // because every index after the gap has shifted by one.
    const withdrawn = five.filter((row) => row.src !== "d.jpg");
    const cursor: WallCursor = {
      createdAt: "2026-01-04T00:00:00.000Z",
      src: "d.jpg",
    };
    const result = wallPage(withdrawn, cursor, 2);
    expect(result.items.map((i) => i.src)).toEqual(["c.jpg", "b.jpg"]);
  });

  test("U-WALLPAGE-6: an exact cursor match disambiguates rows that share a timestamp", () => {
    // Already in the order buildGalleryIndex's tie-break (U-GALLERYINDEX-6)
    // would produce it in.
    const tied = [
      item("x.jpg", "2026-01-01T00:00:00.000Z"),
      item("y.jpg", "2026-01-01T00:00:00.000Z"),
      item("z.jpg", "2026-01-01T00:00:00.000Z"),
    ];
    const first = wallPage(tied, null, 1);
    const second = wallPage(tied, first.nextCursor, 1);
    const third = wallPage(tied, second.nextCursor, 1);
    expect([first, second, third].map((p) => p.items[0]?.src)).toEqual([
      "x.jpg",
      "y.jpg",
      "z.jpg",
    ]);
    expect(third.nextCursor).toBeNull();
  });
});

test.describe("U-ARRANGE the wall's filter and sort, which two pages apply in two places", () => {
  const p = (src: string, createdAt: string): SiteMediaItem => ({
    kind: "photo",
    ...photo(src, { createdAt }),
  });
  const v = (src: string, createdAt: string): SiteMediaItem => ({
    kind: "video",
    mediaId: src.length,
    id: src,
    filename: src,
    src,
    mimeType: "video/mp4",
    slug: src,
    createdAt,
  });

  // Deliberately NOT in date order: an album's `items` arrive in whatever
  // order its curator arranged them, and that is the input `curated` has to
  // hand back untouched.
  const mixed: SiteMediaItem[] = [
    v("second.mp4", "2026-01-02T00:00:00.000Z"),
    p("third.jpg", "2026-01-03T00:00:00.000Z"),
    p("first.jpg", "2026-01-01T00:00:00.000Z"),
  ];

  test("U-ARRANGE-1: 'curated' returns the curator's own order, unsorted and uncopied in meaning", () => {
    // The regression this guards is the expensive one. #95 created a single
    // `galleries_items` table because "ordering cannot be expressed across two
    // tables" and #102 stopped the mapping splitting it apart again; a sort
    // default of `newest` on the album page would have thrown all of that away
    // silently, on every album, the day filtering shipped.
    expect(
      arrangeMedia(mixed, { kind: "all", sort: "curated", race: null }).map((i) => i.src),
    ).toEqual(["second.mp4", "third.jpg", "first.jpg"]);
  });

  test("U-ARRANGE-2: sorting does not mutate the array it was given", () => {
    // The album path calls this with a prop. Sorting in place would reorder
    // React's own copy, so the next render with a different filter would start
    // from an order the curator never chose — a corruption that survives the
    // filter being switched back.
    const before = mixed.map((i) => i.src);
    arrangeMedia(mixed, { kind: "all", sort: "newest", race: null });
    expect(mixed.map((i) => i.src)).toEqual(before);
  });

  test("U-ARRANGE-3: kind narrows across both discriminants", () => {
    expect(
      arrangeMedia(mixed, { kind: "video", sort: "curated", race: null }).map((i) => i.src),
    ).toEqual(["second.mp4"]);
    expect(
      arrangeMedia(mixed, { kind: "photo", sort: "curated", race: null }).map((i) => i.src),
    ).toEqual(["third.jpg", "first.jpg"]);
  });

  test("U-ARRANGE-4: newest and oldest are exact reversals of each other", () => {
    const newest = arrangeMedia(mixed, { kind: "all", sort: "newest", race: null }).map(
      (i) => i.src,
    );
    const oldest = arrangeMedia(mixed, { kind: "all", sort: "oldest", race: null }).map(
      (i) => i.src,
    );
    expect(newest).toEqual(["third.jpg", "second.mp4", "first.jpg"]);
    expect(oldest).toEqual([...newest].reverse());
  });

  test("U-ARRANGE-5: the tiebreak reverses too, so a tied group has one order per direction", () => {
    // Not cosmetic. wallPage's fallback re-finds a withdrawn cursor with the
    // comparator the array was sorted by, so an ascending sort that left `src`
    // ascending would order a batch-imported group one way and search it the
    // other — and only on a corpus with duplicate timestamps, which the seeded
    // one has.
    const tied = [
      p("a.jpg", "2026-01-01T00:00:00.000Z"),
      p("b.jpg", "2026-01-01T00:00:00.000Z"),
      p("c.jpg", "2026-01-01T00:00:00.000Z"),
    ];
    expect(
      arrangeMedia(tied, { kind: "all", sort: "newest", race: null }).map((i) => i.src),
    ).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(
      arrangeMedia(tied, { kind: "all", sort: "oldest", race: null }).map((i) => i.src),
    ).toEqual(["c.jpg", "b.jpg", "a.jpg"]);
  });

  test("U-ARRANGE-6: an oldest-first page resumes correctly after its cursor's item is withdrawn", () => {
    // The whole reason wallPage takes the sort. Told `newest` over an array
    // ordered oldest-first, the fallback picks the first item sorting BEFORE
    // the missing cursor — index 0 — and hands back the first page a second
    // time, forever. Nothing errors; the visitor just scrolls through the same
    // photos again.
    const ascending = arrangeMedia(
      [
        p("a.jpg", "2026-01-01T00:00:00.000Z"),
        p("b.jpg", "2026-01-02T00:00:00.000Z"),
        p("c.jpg", "2026-01-03T00:00:00.000Z"),
        p("d.jpg", "2026-01-04T00:00:00.000Z"),
      ],
      { kind: "all", sort: "oldest", race: null },
    );
    expect(ascending.map((i) => i.src)).toEqual([
      "a.jpg",
      "b.jpg",
      "c.jpg",
      "d.jpg",
    ]);

    const cursor: WallCursor = {
      createdAt: "2026-01-02T00:00:00.000Z",
      src: "b.jpg",
    };
    const withdrawn = ascending.filter((row) => row.src !== "b.jpg");

    expect(
      wallPage(withdrawn, cursor, 2, "oldest").items.map((i) => i.src),
    ).toEqual(["c.jpg", "d.jpg"]);
    // Left at the default, the same call walks backwards to the top instead.
    expect(wallPage(withdrawn, cursor, 2).items.map((i) => i.src)).toEqual([
      "a.jpg",
      "c.jpg",
    ]);
  });
});

/**
 * U-RACEFILTER — narrowing the wall and the shelf to one race.
 *
 * Two failures worth a test, both of which look like nothing on screen.
 *
 * A filter that does not filter: `arrangeMedia` returning everything for a
 * selected race is a page that looks perfectly normal and is simply wrong,
 * and no rendering test can tell the difference between "this race has these
 * photos" and "this is the whole wall".
 *
 * An option that leads nowhere: the option list is derived from the items so
 * that selecting one can never produce an empty grid. `race-editions` has 154
 * rows and two of them have media; a list built from the editions instead
 * would be 154 options, 152 of them dead.
 */
const withRace = (src: string, raceEditionId?: number): SiteMediaItem => ({
  kind: "photo",
  ...photo(src, { raceEditionId }),
});

const editions = [
  { id: 7, eventKey: "other-hardrock", name: "Hardrock 100", nameZh: "硬石 100", year: 2019 },
  { id: 8, eventKey: "other-leadville", name: "Leadville Trail 100", year: 2016 },
];

test.describe("U-RACEFILTER the wall and the shelf narrow to one race", () => {
  const tagged = [withRace("hr1.jpg", 7), withRace("lv.jpg", 8), withRace("none.jpg")];

  test("U-RACEFILTER-1: a selected race keeps only that race's items", () => {
    expect(
      arrangeMedia(tagged, { kind: "all", sort: "curated", race: 7 }).map(
        (i) => i.src,
      ),
    ).toEqual(["hr1.jpg"]);

    // `null` is every race AND everything with no race — not "untagged", which
    // is the reading that would quietly hide most of the wall by default.
    expect(
      arrangeMedia(tagged, { kind: "all", sort: "curated", race: null }).map(
        (i) => i.src,
      ),
    ).toHaveLength(3);
  });

  test("U-RACEFILTER-2: race and kind narrow together, not instead of each other", () => {
    const mixedRaces: SiteMediaItem[] = [
      withRace("hr-photo.jpg", 7),
      {
        kind: "video",
        mediaId: 9,
        id: "v9",
        filename: "hr-clip.mp4",
        src: "hr-clip.mp4",
        mimeType: "video/mp4",
        slug: "hr-clip.mp4",
        createdAt: "2026-01-01T00:00:00.000Z",
        raceEditionId: 7,
      },
      withRace("lv-photo.jpg", 8),
    ];
    expect(
      arrangeMedia(mixedRaces, { kind: "video", sort: "curated", race: 7 }).map(
        (i) => i.src,
      ),
    ).toEqual(["hr-clip.mp4"]);
  });

  test("U-RACEFILTER-3: only races that actually have something are offered", () => {
    const options = raceFilterOptions(tagged, editions);
    expect(options.map((o) => o.id)).toEqual([7, 8]);
    expect(options.map((o) => o.count)).toEqual([1, 1]);
    // Newest first, and Chinese name when there is one — the same shape the
    // upload picker and the album title use.
    expect(options[0].label).toContain("2019");
    expect(options[0].label).toContain("硬石 100");
    expect(options[1].label).toContain("Leadville");

    // An edition nothing points at is not an option, however real it is.
    expect(
      raceFilterOptions([withRace("only.jpg", 7)], editions).map((o) => o.id),
    ).toEqual([7]);
  });

  test("U-RACEFILTER-4: an id with no matching edition is dropped, not shown blank", () => {
    // Possible while an edition is being renamed or removed. A blank option in
    // a select is indistinguishable from a bug, and choosing it would empty
    // the grid for no stated reason.
    expect(raceFilterOptions([withRace("orphan.jpg", 99)], editions)).toEqual([]);
  });

  test("U-RACEFILTER-5: an album card carries every race its contents name", () => {
    // The shelf filters on this. Derived, never stored — `galleries` has no
    // race column and deliberately gains none, so that a retagged photo
    // cannot leave the album claiming a race it no longer holds.
    const card = albumCard(
      album("mixed", [withRace("a.jpg", 7), withRace("b.jpg", 8), withRace("c.jpg", 7)]),
    );
    expect(card.raceEditionIds).toEqual([7, 8]);
    expect(albumCard(album("plain", [withRace("d.jpg")])).raceEditionIds).toEqual([]);
  });
});
