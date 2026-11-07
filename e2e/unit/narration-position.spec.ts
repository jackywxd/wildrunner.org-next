import { expect, test } from "@playwright/test";

import {
  formatClock,
  readPositions,
  recordPosition,
  resumePoint,
  type PositionMap,
} from "@/lib/reader/narration-position";

/**
 * U-RESUME — whether a reader's remembered place in a narration is still
 * worth offering, and which one.
 *
 * Pure: the clock is the `now` argument, the storage is a string in and a map
 * out. What the component does with these answers (events, the notice, setting
 * `currentTime`) is the browser journey's job, V-LISTEN-T1.
 */

const KEY_A = "article-audio/33-5989c777.mp3";
const KEY_B = "article-audio/31-0badc0de.mp3";

test.describe("U-RESUME a remembered place in a narration", () => {
  test("U-RESUME-1: near either end the record is removed, so it is never offered", () => {
    // Guards: a reader who FINISHED the article being invited to resume it 9
    // seconds from the end, on a closing sentence with no context. The record
    // has to disappear when the position crosses the tail, not merely be
    // ignored — otherwise it comes back the moment the rule is loosened.
    const d = 600;
    const had: PositionMap = { [KEY_A]: { t: 300, d, at: 1 } };

    // 15 s from the end is still resumable; one second past it is not.
    expect(recordPosition(had, KEY_A, d - 15, d, 2)[KEY_A]?.t).toBe(d - 15);
    expect(recordPosition(had, KEY_A, d - 14, d, 2)[KEY_A]).toBeUndefined();

    // Under five seconds is "pressed play and left", not "where I stopped".
    expect(recordPosition(had, KEY_A, 5, d, 2)[KEY_A]?.t).toBe(5);
    expect(recordPosition(had, KEY_A, 4.9, d, 2)[KEY_A]).toBeUndefined();

    // And a record that was written before the rule applied is not offered.
    expect(resumePoint({ t: d - 3, d, at: 1 }, d)).toBeNull();
    expect(resumePoint({ t: 2, d, at: 1 }, d)).toBeNull();

    // A duration that is not known yet must not be read as "the end": deleting
    // a good record because metadata had not loaded would erase the bookmark
    // of every reader who leaves before pressing play.
    expect(recordPosition(had, KEY_A, 0, Number.NaN, 2)).toBe(had);
  });

  test("U-RESUME-2: a recording of a different length is not resumed", () => {
    // Guards: `?force=true` regenerates the audio under the SAME key (the key
    // hashes the script, not the voice), so a position from the old recording
    // would drop the reader into the middle of a sentence of the new one.
    // Duration is the only thing that distinguishes them.
    const entry = { t: 300, d: 600, at: 1 };
    expect(resumePoint(entry, 600)).toBe(300);

    // Browsers estimate a VBR MP3's length differently; a second, or 0.5% of
    // a long file, is the same recording.
    expect(resumePoint(entry, 600.9)).toBe(300);
    expect(resumePoint(entry, 599.2)).toBe(300);
    const long = { t: 9000, d: 27512, at: 1 };
    expect(resumePoint(long, 27512 + 137)).toBe(9000); // 0.498%
    expect(resumePoint(long, 27512 + 139)).toBeNull(); // 0.505%

    // A different recording is refused, as is a player that has no duration.
    expect(resumePoint(entry, 612)).toBeNull();
    expect(resumePoint(entry, 480)).toBeNull();
    expect(resumePoint(entry, Number.NaN)).toBeNull();
    expect(resumePoint(undefined, 600)).toBeNull();
  });

  test("U-RESUME-3: two narrations never share a place", () => {
    // Guards: the position of one article being applied to another, which
    // happens if the map is keyed by anything shared (a slug that collides
    // across locales, a single "last position" slot).
    let map: PositionMap = {};
    map = recordPosition(map, KEY_A, 120, 600, 1_000);
    map = recordPosition(map, KEY_B, 45, 300, 2_000);
    expect(map[KEY_A]).toEqual({ t: 120, d: 600, at: 1_000 });
    expect(map[KEY_B]).toEqual({ t: 45, d: 300, at: 2_000 });

    // Finishing one leaves the other alone.
    map = recordPosition(map, KEY_A, 599, 600, 3_000);
    expect(map[KEY_A]).toBeUndefined();
    expect(map[KEY_B]).toEqual({ t: 45, d: 300, at: 2_000 });

    // And it is the same through a round trip of the stored string.
    expect(readPositions(JSON.stringify(map))).toEqual(map);
  });

  test("U-RESUME-4: past 50 articles the oldest are dropped, never the newest", () => {
    // Guards: storage growing without bound over years of reading, and — the
    // sharper failure — a trim that keeps the wrong end, discarding the
    // article the reader is on at the moment they leave it.
    let map: PositionMap = {};
    for (let i = 0; i < 50; i += 1) {
      map = recordPosition(map, `article-audio/${i}-aaaaaaaa.mp3`, 60, 600, 1_000 + i);
    }
    expect(Object.keys(map)).toHaveLength(50);

    map = recordPosition(map, "article-audio/99-bbbbbbbb.mp3", 60, 600, 5_000);
    const keys = Object.keys(map);
    expect(keys).toHaveLength(50);
    expect(keys).toContain("article-audio/99-bbbbbbbb.mp3");
    expect(keys).not.toContain("article-audio/0-aaaaaaaa.mp3");
    expect(keys).toContain("article-audio/1-aaaaaaaa.mp3");

    // Rewriting an existing article does not count twice.
    map = recordPosition(map, "article-audio/1-aaaaaaaa.mp3", 90, 600, 6_000);
    expect(Object.keys(map)).toHaveLength(50);
    expect(map["article-audio/1-aaaaaaaa.mp3"]?.t).toBe(90);
  });

  test("U-RESUME-5: storage that is not ours, or not valid, reads as empty", () => {
    // Guards: an exception in the effect that reads storage. It runs on every
    // article with narration, over a string any extension or older version
    // may have written, and a throw there is a console error on the page and
    // a reader who cannot listen.
    expect(readPositions(null)).toEqual({});
    expect(readPositions("")).toEqual({});
    expect(readPositions("{not json")).toEqual({});
    expect(readPositions("[1,2]")).toEqual({});
    expect(readPositions("42")).toEqual({});

    // One bad entry costs only itself.
    const good = { t: 60, d: 600, at: 1 };
    expect(
      readPositions(
        JSON.stringify({
          [KEY_A]: good,
          [KEY_B]: { t: "60", d: 600, at: 1 },
          "article-audio/1-x.mp3": { t: -1, d: 600, at: 1 },
        }),
      ),
    ).toEqual({ [KEY_A]: good });
  });

  test("U-RESUME-6: the clock reads m:ss, then h:mm:ss", () => {
    // Guards: the notice saying 「上次聽到 5:7」 or 「70:00」 for a file that is
    // 7 hours long (post 33 is about 7.6).
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(7.9)).toBe("0:07");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3599)).toBe("59:59");
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(27512.35)).toBe("7:38:32");
  });
});
