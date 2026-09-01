import { expect, test } from "@playwright/test";

import type { SiteGallery, SiteMediaItem, SitePhoto } from "@/lib/content-types";
import {
  albumCard,
  buildGalleryIndex,
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
