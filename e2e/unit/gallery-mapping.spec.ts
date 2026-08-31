import { expect, test } from "@playwright/test";

import { mapPayloadGallery } from "@/lib/media/gallery-mapping";
import type { GalleryDoc } from "@/lib/media/gallery-mapping";

/**
 * U-GALLERYMAP — an album reaches the page in the order its curator set.
 *
 * `galleries_items` exists because "ordering cannot be expressed across two
 * tables" — that is the whole argument the migration in #95 was written on.
 * The mapping then split the one ordered list back into `images` and `videos`
 * by mimeType, which preserved each half's internal order and dropped the
 * interleaving between them: a curator who arranged video, photo, photo,
 * video got video, video, photo, photo. The schema could express something no
 * page could render, and nothing failed.
 *
 * Nothing could have failed, either: `mapPayloadGallery` lived in
 * src/lib/content.ts, which imports `@payload-config` — a top-level await that
 * boots a miniflare on import — so the unit lane could not reach it. Moving it
 * to a pure module is what makes this test possible at all.
 */
const media = (id: number, mimeType: string) => ({
  id,
  blurDataURL: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  filename: `f${id}.${mimeType.startsWith("video/") ? "mp4" : "jpg"}`,
  filesize: 10,
  height: 100,
  legacyVideoId: null,
  mimeType,
  raceEdition: null,
  streamId: null,
  streamReady: false,
  url: `https://images.wildrunner.org/f${id}.${mimeType.startsWith("video/") ? "mp4" : "jpg"}`,
  width: 100,
});

const doc = (kinds: ("photo" | "video")[]): GalleryDoc =>
  ({
    cover: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    eventDate: null,
    featured: false,
    items: kinds.map((kind, i) => ({
      id: `row-${i}`,
      featured: false,
      media: media(i + 1, kind === "video" ? "video/mp4" : "image/jpeg"),
    })),
    location: null,
    name: "Album",
    slug: "album",
  }) as unknown as GalleryDoc;

test.describe("U-GALLERYMAP an album keeps the order it was curated in", () => {
  test("U-GALLERYMAP-1: video, photo, photo, video survives as itself", () => {
    const gallery = mapPayloadGallery(doc(["video", "photo", "photo", "video"]));

    // The interleaving, which the two-list shape could not carry.
    expect(gallery.items.map((item) => item.kind)).toEqual([
      "video",
      "photo",
      "photo",
      "video",
    ]);
    // And the rows themselves, so a reordering that happened to produce the
    // right kinds in the wrong positions still fails.
    expect(gallery.items.map((item) => item.filename)).toEqual([
      "f1.mp4",
      "f2.jpg",
      "f3.jpg",
      "f4.mp4",
    ]);
  });

  test("U-GALLERYMAP-2: a row whose media never loaded is skipped, not counted", () => {
    // `_galleries_v_version_items` keeps ON DELETE set null on purpose, so a
    // deleted file leaves a row with no media rather than rewriting history.
    const withHole = doc(["photo", "photo"]);
    (withHole.items as { media: unknown }[])[0].media = null;

    const gallery = mapPayloadGallery(withHole);
    expect(gallery.items.map((item) => item.filename)).toEqual(["f2.jpg"]);
  });
});
