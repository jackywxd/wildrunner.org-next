import { expect, test } from "@playwright/test";

import { pickFallbackMusic, resolveAlbumMusic } from "@/lib/media/album-music";

/**
 * U-ALBUMMUSIC — which track an album plays, and where the answer comes from.
 *
 * Two failures worth pinning, both silent.
 *
 * A URL reaching the client. Everything that leaves this module is an
 * eleven-character id, because the `src` of a third-party frame is the one
 * place a stray value in the database becomes an arbitrary embedded origin on
 * our own page. There are validators in front of both columns, and a validator
 * can be relaxed, bypassed by a script write, or predate a row — so the parse
 * on the way out is the guarantee, and this is what says so.
 *
 * A fallback that is not stable. The pick is keyed on the album's slug on
 * purpose: a random one would give the same album different music on every
 * visit, which reads as a bug to anyone who liked the first one, and could not
 * be asserted at all.
 */
const TRACKS = [
  { url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" },
  { url: "https://youtu.be/bbbbbbbbbbb" },
  { url: "https://www.youtube.com/watch?v=ccccccccccc" },
];

test.describe("U-ALBUMMUSIC an album's music, and the site-wide floor", () => {
  test("U-ALBUMMUSIC-1: the album's own music wins over the list", () => {
    expect(
      resolveAlbumMusic({
        slug: "utmb-2024",
        own: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        fallback: TRACKS,
      }),
    ).toBe("dQw4w9WgXcQ");
  });

  test("U-ALBUMMUSIC-2: with no music of its own it takes one from the list", () => {
    const picked = resolveAlbumMusic({
      slug: "utmb-2024",
      own: null,
      fallback: TRACKS,
    });
    expect(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]).toContain(picked);
  });

  test("U-ALBUMMUSIC-3: the same album always gets the same track", () => {
    // The whole reason the pick is a hash rather than `Math.random()`. Asserted
    // across several slugs, because a broken implementation that returned the
    // first entry every time would also be stable — and wrong in the other
    // direction, since the list exists to spread albums across it.
    const first = ["a-1", "a-2", "a-3", "a-4", "a-5"].map((slug) =>
      pickFallbackMusic(slug, TRACKS),
    );
    const again = ["a-1", "a-2", "a-3", "a-4", "a-5"].map((slug) =>
      pickFallbackMusic(slug, TRACKS),
    );
    expect(again).toEqual(first);
    expect(new Set(first).size, "the list should not collapse to one track").toBeGreaterThan(1);
  });

  test("U-ALBUMMUSIC-4: an empty or unusable list is silence, not a guess", () => {
    for (const fallback of [undefined, null, [], [{ url: null }], [{ url: "" }]]) {
      expect(resolveAlbumMusic({ slug: "any", own: null, fallback })).toBeNull();
    }
  });

  test("U-ALBUMMUSIC-5: an entry that is not one video is dropped before the pick", () => {
    // Not after. One bad row winning the draw would silence that album with
    // nothing on screen to explain it — and the list is typed in by hand, so a
    // bad row is the expected case rather than the exotic one.
    const withRubbish = [
      { url: "https://www.youtube.com/playlist?list=PL123" },
      { url: "https://vimeo.com/1" },
      { url: "https://www.youtube.com/watch?v=ddddddddddd" },
      { url: "not a url" },
    ];
    for (const slug of ["a", "b", "c", "d", "e", "f"]) {
      expect(pickFallbackMusic(slug, withRubbish)).toBe("ddddddddddd");
    }
  });

  test("U-ALBUMMUSIC-6: an album's own unusable value falls through to the list", () => {
    // A stored value that stopped parsing must not mean "no music" while a
    // perfectly good list sits behind it — and must certainly not reach an
    // iframe.
    expect(
      resolveAlbumMusic({
        slug: "utmb-2024",
        own: "https://www.youtube.com/playlist?list=PL123",
        fallback: TRACKS,
      }),
    ).not.toBeNull();
    expect(
      resolveAlbumMusic({ slug: "utmb-2024", own: "javascript:alert(1)", fallback: [] }),
    ).toBeNull();
  });
});
