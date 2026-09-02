import { expect, test } from "@playwright/test";

import { publicMediaFieldsChanged } from "@/lib/media/public-fields";

/**
 * U-MEDIAFIELDS — which media writes are worth busting the cache for.
 *
 * `media` is the most-written collection on the site, and the hook that now
 * revalidates on it fires on every one of those writes. Most are invisible:
 * `unusedMediaSweep` stamps `unusedSince` across the library weekly and the
 * transcode endpoints step `transcodeState` several times per video. Without
 * this predicate that is hundreds of cache invalidations a week for rows whose
 * rendered output never moved.
 *
 * The predicate lives in its own module so this spec can reach it: the hook
 * file imports `next/cache` transitively, and the branches worth pinning are
 * all here.
 */
const row = (over: Record<string, unknown> = {}) => ({
  alt: "a photo",
  blurDataURL: "data:image/png;base64,xx",
  description: null,
  filename: "photo.jpg",
  filesize: 1000,
  height: 800,
  legacyVideoId: null,
  mimeType: "image/jpeg",
  raceEdition: 18,
  streamId: null,
  streamReady: false,
  unusedSince: null,
  transcodeState: "done",
  url: "https://images.wildrunner.org/photo.jpg",
  usage: "gallery",
  width: 1200,
  ...over,
});

test.describe("U-MEDIAFIELDS a media write only counts if a page shows it", () => {
  test("U-MEDIAFIELDS-1: the weekly sweep's own write does not count", () => {
    // The case this predicate exists for. unusedMediaSweep writes exactly this
    // field and nothing else, on potentially every row it examines.
    expect(
      publicMediaFieldsChanged(
        row({ unusedSince: "2026-08-31T00:00:00.000Z" }),
        row(),
      ),
    ).toBe(false);

    // Same for the transcode state machine, which steps several times per
    // video before it rewrites anything a reader sees.
    expect(
      publicMediaFieldsChanged(row({ transcodeState: "running" }), row()),
    ).toBe(false);
  });

  test("U-MEDIAFIELDS-2: taking a file off the photo wall counts", () => {
    // The write this whole PR is ordered around — un-publishing must reach the
    // page, and after /gallery is cached this predicate is what decides that.
    expect(
      publicMediaFieldsChanged(row({ usage: "private" }), row()),
    ).toBe(true);
  });

  test("U-MEDIAFIELDS-3: a transcode that finishes counts", () => {
    // `transcodeState` alone does not, but finishing rewrites the URL the
    // player loads, and that does.
    expect(
      publicMediaFieldsChanged(
        row({ url: "https://images.wildrunner.org/transcoded/1-1080p.mp4" }),
        row(),
      ),
    ).toBe(true);
  });

  test("U-MEDIAFIELDS-4: the same race tag at two depths is not a change", () => {
    // A relationship arrives as a bare id or a populated object depending on
    // the depth of the request that triggered the write. Compared with `!==`
    // this would read as a change on every save that happened to use a
    // different depth — which is most of them.
    expect(
      publicMediaFieldsChanged(row({ raceEdition: { id: 18 } }), row()),
    ).toBe(false);
    // ...and a genuinely different race still is one.
    expect(
      publicMediaFieldsChanged(row({ raceEdition: { id: 19 } }), row()),
    ).toBe(true);
  });

  test("U-MEDIAFIELDS-5: writing a caption counts", () => {
    // The field a member edits most expecting to see the result: /gallery
    // caches for an hour, so if this is not in the list the caption they just
    // wrote appears at some unexplained point within it. Both directions,
    // because a caption is as removable as it is addable.
    expect(
      publicMediaFieldsChanged(row({ description: "終點前最後一個彎" }), row()),
    ).toBe(true);
    expect(
      publicMediaFieldsChanged(row(), row({ description: "終點前最後一個彎" })),
    ).toBe(true);
  });

  test("U-MEDIAFIELDS-6: a create always counts", () => {
    // No previousDoc. A newly uploaded public photo is the other half of what
    // the hook is for.
    expect(publicMediaFieldsChanged(row(), undefined)).toBe(true);
  });
});
