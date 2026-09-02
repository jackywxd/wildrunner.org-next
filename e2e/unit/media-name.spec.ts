/**
 * `mediaDisplayName` — the label the site shows for a photo or video.
 *
 * Every `filename`/`url` pair below is copied from production (measured
 * 2026-08-18), not invented, because the transform exists entirely to cope
 * with the shapes the corpus actually contains: migration-era names that
 * encode their R2 path *and* their percent-encoding, plus newer clean
 * uploads.
 *
 * `@playwright/test` rather than `../helpers/test`: nothing here touches
 * `page`, and that helper's console-guard fixture depends on it, so
 * importing it would launch a browser for nothing.
 */
import { expect, test } from "@playwright/test";

import { mediaDisplayName } from "@/lib/media-name";

test.describe("U-NAME the label shown for a media file", () => {
  test("U-NAME-1: the url recovers a name the filename has mangled", () => {
    // The reason this function takes the whole media object. `filename` has
    // lost the spaces to `-20` (`%20` with `%` rewritten as `-`), and no
    // rule can undo that safely — see U-NAME-2.
    expect(
      mediaDisplayName({
        filename: "gallery--2023--utmb--UTMB-202023-20Vertical.m4v",
        src: "https://images.wildrunner.org/gallery/2023/utmb/UTMB%202023%20Vertical.m4v",
      }),
    ).toBe("UTMB 2023 Vertical");

    // Same mechanism, non-ASCII: the whole title is percent-encoded.
    expect(
      mediaDisplayName({
        filename: "gallery--2019--Marunner---E9-A6-AC-E7-87-9F2019-final.mp4",
        src: "https://images.wildrunner.org/gallery/2019/Marunner/%E9%A6%AC%E7%87%9F2019-final.mp4",
      }),
    ).toBe("馬營2019 final");
  });

  test("U-NAME-2: a real 20 in a name is left alone", () => {
    // The case that rules out decoding `-20` back to a space: here it is
    // part of the year, and 'fixing' it would produce `QMT80 26 4K`.
    expect(
      mediaDisplayName({
        filename: "gallery--2026--QMT--QMT80-2026-4K.m4v",
        src: "https://images.wildrunner.org/gallery/2026/QMT/QMT80-2026-4K.m4v",
      }),
    ).toBe("QMT80 2026 4K");
  });

  test("U-NAME-3: with no url, the filename's path prefix is still dropped", () => {
    // Member uploads through the direct-upload path can land without a url
    // on the mapped object; the label must still not read as a file path.
    expect(
      mediaDisplayName({ filename: "posts--2024--utmb--img44.webp" }),
    ).toBe("img44");
  });

  test("U-NAME-4: query strings never reach the label", () => {
    // A cache-busted or signed url would otherwise render its parameters.
    expect(
      mediaDisplayName({ src: "https://images.wildrunner.org/674.mov?v=2" }),
    ).toBe("674");
  });

  test("U-NAME-5: only the real extension is stripped", () => {
    // Camera exports contain dots mid-name; cutting at the first dot would
    // truncate the label.
    expect(
      mediaDisplayName({ src: "/media/10311720450963_.pic_hd.webp" }),
    ).toBe("10311720450963 .pic hd");
  });

  test("U-NAME-7: a title outranks every derivation, but only once trimmed to something", () => {
    // The whole point of the field: a person's own name for the file wins
    // over a guess built from a mangled filename.
    expect(
      mediaDisplayName({
        title: "馬營新年首跑",
        filename: "gallery--2019--Marunner---E9-A6-AC-E7-87-9F2019-final.mp4",
        src: "https://images.wildrunner.org/gallery/2019/Marunner/%E9%A6%AC%E7%87%9F2019-final.mp4",
      }),
    ).toBe("馬營新年首跑");

    // Trimmed, not merely truthy — a title that is only whitespace is
    // "nobody has said" in every practical sense, and falling through to the
    // derivation is a real label instead of a blank one.
    expect(
      mediaDisplayName({
        title: "   ",
        src: "https://images.wildrunner.org/gallery/2026/QMT/QMT80-2026-4K.m4v",
      }),
    ).toBe("QMT80 2026 4K");

    // Absent entirely — the state of every row before this field existed —
    // falls through exactly the same way.
    expect(
      mediaDisplayName({ src: "https://images.wildrunner.org/674.mov" }),
    ).toBe("674");
  });

  test("U-NAME-6: never returns an empty label, and never throws", () => {
    // The label sits in a fixed-height row next to a share button; empty
    // means a strip with no clue what it belongs to.
    expect(mediaDisplayName({ filename: "---.mp4" })).not.toBe("");
    // A stray `%` is not a valid escape — decodeURIComponent throws on it.
    expect(mediaDisplayName({ src: "/media/100%-effort.mp4" })).not.toBe("");
    expect(mediaDisplayName({})).toBe("");
    expect(mediaDisplayName(null)).toBe("");
    expect(mediaDisplayName(undefined)).toBe("");
  });
});
