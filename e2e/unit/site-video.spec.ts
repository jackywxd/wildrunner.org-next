import { expect, test } from "@playwright/test";

import { mediaToSiteVideo } from "@/lib/media/site-video";

/**
 * U-SITEVIDEO — the one `Media` → `SiteVideo` conversion.
 *
 * Written when the mapping was extracted out of `src/lib/content.ts` and a
 * hand-copied second version in `MediaDetailDialog`, on its way to a third
 * and fourth in the article renderer and the member's preview. What is worth
 * pinning is the share-id precedence: it decides which URL a reader's
 * permalink resolves through, `media.legacyVideoId` exists solely to keep the
 * links published before 2026 working, and nothing tested it.
 */
const media = (over: Partial<Parameters<typeof mediaToSiteVideo>[0]> = {}) =>
  ({
    id: 7,
    filename: "galleries--2023--foo--clip.mp4",
    filesize: 1234,
    legacyVideoId: null,
    mimeType: "video/mp4",
    streamId: null,
    streamReady: false,
    url: "https://images.wildrunner.org/galleries/2023/foo/clip.mp4",
    ...over,
  }) as Parameters<typeof mediaToSiteVideo>[0];

test.describe("U-SITEVIDEO the share id and what it is built from", () => {
  test("U-SITEVIDEO-1: an explicit id wins over everything stored", () => {
    // What `getRaceGalleries` passes: the media id, because a race album is a
    // query rather than a stored row and has no membership id to offer.
    expect(mediaToSiteVideo(media({ legacyVideoId: "old-slug" }), "7")?.id).toBe("7");
  });

  test("U-SITEVIDEO-2: legacyVideoId beats a filename-derived slug", () => {
    // The reason the column exists. `media.filename` is the flattened
    // migration name, so deriving from it does NOT reproduce the id the
    // already-published permalinks use.
    expect(mediaToSiteVideo(media({ legacyVideoId: "clip" }))?.id).toBe("clip");
    expect(mediaToSiteVideo(media())?.id).toBe("galleries-2023-foo-clip");
  });

  test("U-SITEVIDEO-3: a blank id falls through rather than being used", () => {
    // Whitespace is not an identifier. Both the argument and the column are
    // trimmed before being believed, or a stray space would produce a
    // permalink nothing can resolve.
    expect(mediaToSiteVideo(media({ legacyVideoId: "  " }))?.id).toBe(
      "galleries-2023-foo-clip",
    );
    expect(mediaToSiteVideo(media({ legacyVideoId: "clip" }), "   ")?.id).toBe("clip");
  });

  test("U-SITEVIDEO-4: no url means no video, even with a Stream id", () => {
    // Pinning the documented gap rather than the behaviour anyone wants: the
    // player's first branch needs only `streamId && streamReady`, so this
    // drops a Stream-only video. Unreachable today (STREAM_INGEST is off), and
    // preserved deliberately so the extraction changed nothing that ships. If
    // this test is what fails when Stream is switched on, that is the point.
    expect(mediaToSiteVideo(media({ url: null }))).toBeNull();
    expect(
      mediaToSiteVideo(media({ url: null, streamId: "abc", streamReady: true })),
    ).toBeNull();
  });

  test("U-SITEVIDEO-5: the extension comes off the filename, or is absent", () => {
    expect(mediaToSiteVideo(media({ filename: "a.mov" }))?.extension).toBe("mov");
    expect(mediaToSiteVideo(media({ filename: "no-extension" }))?.extension).toBeUndefined();
  });
});
