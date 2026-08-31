import { expect, test } from "@playwright/test";

import type { SiteGallery, SitePhoto } from "@/lib/content-types";
import { albumCard, buildGalleryIndex, unionBySrc } from "@/lib/media/gallery-index";

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

    expect(index.photos.map((p) => p.src)).toEqual(["curated.jpg"]);
  });

  test("U-GALLERYINDEX-2: a file reached by both routes appears once", () => {
    const both = photo("both.jpg");
    const index = buildGalleryIndex(
      [album("a", [{ kind: "photo", ...both }])],
      [both],
      [],
    );

    expect(index.photos).toHaveLength(1);
  });

  test("U-GALLERYINDEX-3: the union is newest-first, across both routes", () => {
    // The wall's whole premise. Ordering by source rather than by date is what
    // put a member's newest upload 24th behind every album video.
    const older = photo("older.jpg", { createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = photo("newer.jpg", { createdAt: "2026-08-01T00:00:00.000Z" });

    expect(unionBySrc([older], [newer]).map((p) => p.src)).toEqual([
      "newer.jpg",
      "older.jpg",
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
});
