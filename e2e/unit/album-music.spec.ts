import { expect, test } from "@playwright/test";

import { buildMusicPlaylist } from "@/lib/media/album-music";

/**
 * U-ALBUMMUSIC — what an album plays, in what order.
 *
 * Three failures worth pinning, all silent.
 *
 * A URL reaching the client. Everything that leaves this module is an
 * eleven-character id, because the `src` of a third-party frame is the one
 * place a stray value in the database becomes an arbitrary embedded origin on
 * our own page. There are validators in front of every column that feeds this,
 * and a validator can be relaxed, bypassed by a script write, or predate a row
 * — so the parse on the way out is the guarantee, and this is what says so.
 *
 * A list that is not stable. Where an album starts in the site-wide list is
 * keyed on its slug on purpose: a random start would give the same album
 * different music on every visit, which reads as a bug to anyone who liked the
 * first one, and could not be asserted at all.
 *
 * A list with a repeat in it. `loop` over a list that plays one track twice in
 * a row is a list that stutters, and the case that produces it — an album
 * whose own music is also in the site list — is the likely one, not the
 * exotic one.
 */
const TRACKS = [
  { url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" },
  { url: "https://youtu.be/bbbbbbbbbbb" },
  { url: "https://www.youtube.com/watch?v=ccccccccccc" },
];

test.describe("U-ALBUMMUSIC the album's playlist", () => {
  test("U-ALBUMMUSIC-1: the album's own music goes first, then the site list", () => {
    // Not "instead of". One track meant a two-hundred-photo slideshow heard
    // ninety seconds on a loop, and it meant 下一首 had nowhere to go.
    const list = buildMusicPlaylist({
      slug: "utmb-2024",
      own: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      fallback: TRACKS,
    });
    expect(list[0]).toBe("dQw4w9WgXcQ");
    expect(list).toHaveLength(4);
    expect(new Set(list.slice(1))).toEqual(
      new Set(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]),
    );
  });

  test("U-ALBUMMUSIC-2: with no music of its own it plays the whole site list", () => {
    const list = buildMusicPlaylist({ slug: "utmb-2024", own: null, fallback: TRACKS });
    expect(new Set(list)).toEqual(
      new Set(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]),
    );
  });

  test("U-ALBUMMUSIC-3: an album always starts at the same place in the list", () => {
    // The whole reason the start is a hash rather than `Math.random()`.
    // Asserted across several slugs, because an implementation that always
    // started at index 0 would also be stable — and wrong in the other
    // direction, since the rotation exists to spread albums across the list.
    const firsts = ["a-1", "a-2", "a-3", "a-4", "a-5"].map(
      (slug) => buildMusicPlaylist({ slug, own: null, fallback: TRACKS })[0],
    );
    const again = ["a-1", "a-2", "a-3", "a-4", "a-5"].map(
      (slug) => buildMusicPlaylist({ slug, own: null, fallback: TRACKS })[0],
    );
    expect(again).toEqual(firsts);
    expect(
      new Set(firsts).size,
      "every album starting on the same track is not a rotation",
    ).toBeGreaterThan(1);
  });

  test("U-ALBUMMUSIC-4: rotating keeps every track, it does not truncate", () => {
    // The bug a `slice` would produce: an album whose start lands near the end
    // of the list could only ever play the last one or two.
    for (const slug of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      expect(
        buildMusicPlaylist({ slug, own: null, fallback: TRACKS }),
        `${slug} lost a track`,
      ).toHaveLength(3);
    }
  });

  test("U-ALBUMMUSIC-5: a track that is also the album's own is not played twice", () => {
    const list = buildMusicPlaylist({
      slug: "utmb-2024",
      own: "https://youtu.be/bbbbbbbbbbb",
      fallback: TRACKS,
    });
    expect(list[0]).toBe("bbbbbbbbbbb");
    expect(list).toHaveLength(3);
    expect(new Set(list).size).toBe(3);
  });

  test("U-ALBUMMUSIC-6: an empty or unusable list is silence, not a guess", () => {
    for (const fallback of [undefined, null, [], [{ url: null }], [{ url: "" }]]) {
      expect(buildMusicPlaylist({ slug: "any", own: null, fallback })).toEqual([]);
    }
  });

  test("U-ALBUMMUSIC-7: an entry that is not one video is dropped, not left as a gap", () => {
    // Dropped before anything else sees the list. A bad row surviving would be
    // a dead track in the middle of a playlist, and the list is typed in by
    // hand, so a bad row is the expected case rather than the exotic one.
    const withRubbish = [
      { url: "https://www.youtube.com/playlist?list=PL123" },
      { url: "https://vimeo.com/1" },
      { url: "https://www.youtube.com/watch?v=ddddddddddd" },
      { url: "not a url" },
    ];
    expect(
      buildMusicPlaylist({ slug: "a", own: null, fallback: withRubbish }),
    ).toEqual(["ddddddddddd"]);
  });

  test("U-ALBUMMUSIC-8: an album's own unusable value falls through to the list", () => {
    // A stored value that stopped parsing must not mean "no music" while a
    // perfectly good list sits behind it — and must certainly not reach an
    // iframe.
    expect(
      buildMusicPlaylist({
        slug: "utmb-2024",
        own: "https://www.youtube.com/playlist?list=PL123",
        fallback: TRACKS,
      }),
    ).toHaveLength(3);
    expect(
      buildMusicPlaylist({ slug: "x", own: "javascript:alert(1)", fallback: [] }),
    ).toEqual([]);
  });
});
