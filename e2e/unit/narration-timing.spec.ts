import { expect, test } from "@playwright/test";

import {
  findTiming,
  lineAt,
  parseTiming,
  timingResponseParts,
  type TimingBucket,
} from "@/lib/reader/narration-timing";

/**
 * U-TIMING — the table that says where each line of a narration starts.
 *
 * A bad table does not break anything visible: the audio plays, the page
 * highlights a paragraph, and the paragraph is the wrong one. So every
 * rule is pinned by the way a table could be wrong while looking fine.
 */

const KEY = "article-audio/7-abcd1234.mp3";

const table = (over: Record<string, unknown> = {}) => ({
  version: 1,
  audio: KEY,
  bytes: 1000,
  duration: 30,
  lines: 4,
  precision: "block",
  source: "pieces",
  starts: [0, 5.5, 5.5, 20],
  ...over,
});

test.describe("U-TIMING parseTiming", () => {
  test("U-TIMING-1: a consistent table is accepted, and each way of being wrong is refused", () => {
    expect(parseTiming(table())).toEqual(table());

    // Fewer or more starts than lines: every line after the gap is shifted.
    expect(parseTiming(table({ starts: [0, 5.5, 20] }))).toBeNull();
    expect(parseTiming(table({ starts: [0, 5.5, 5.5, 20, 25] }))).toBeNull();
    // Decreasing: time does not run backwards in an MP3.
    expect(parseTiming(table({ starts: [0, 9, 5.5, 20] }))).toBeNull();
    // Outside the audio, either side.
    expect(parseTiming(table({ starts: [0, 5.5, 5.5, 31] }))).toBeNull();
    expect(parseTiming(table({ starts: [-1, 5.5, 5.5, 20] }))).toBeNull();
    // Not numbers.
    expect(parseTiming(table({ starts: [0, "5.5", 5.5, 20] }))).toBeNull();
    expect(parseTiming(table({ starts: [0, null, 5.5, 20] }))).toBeNull();
    // A format this reader was not written for.
    expect(parseTiming(table({ version: 2 }))).toBeNull();
    expect(parseTiming(table({ precision: "word" }))).toBeNull();
    // Shapes that are not a table at all.
    expect(parseTiming(null)).toBeNull();
    expect(parseTiming("{}")).toBeNull();
    expect(parseTiming({})).toBeNull();
  });
});

/** A bucket where the MP3 is `mp3Size` bytes (the MP3's own content is irrelevant). */
function bucket(mp3Size: number, json: string | null, key = KEY): TimingBucket {
  return {
    head: async (k) => (k === key ? { size: mp3Size } : null),
    get: async (k) => (k === `${key}.json` && json !== null ? { text: async () => json } : null),
  };
}

test.describe("U-TIMING findTiming", () => {
  test("U-TIMING-2: only a table for this post's current MP3 is returned", async () => {
    const good = JSON.stringify(table());
    expect(await findTiming(bucket(1000, good), 7, KEY)).toEqual(table());

    // `?force=true` regenerated the audio under the same key: same `audio`,
    // different size. The old table must not be used.
    expect(await findTiming(bucket(1001, good), 7, KEY)).toBeNull();
    // No table yet, or no audio for it.
    expect(await findTiming(bucket(1000, null), 7, KEY)).toBeNull();
    expect(await findTiming(bucket(1000, good, "article-audio/7-ffffffff.mp3"), 7, KEY)).toBeNull();
    // A table copied under the wrong audio's name.
    expect(await findTiming(bucket(1000, JSON.stringify(table({ audio: "article-audio/7-00000000.mp3" }))), 7, KEY)).toBeNull();
    // Broken or invalid JSON.
    expect(await findTiming(bucket(1000, "{not json"), 7, KEY)).toBeNull();
    expect(await findTiming(bucket(1000, JSON.stringify(table({ starts: [0] }))), 7, KEY)).toBeNull();

    // Another article's key, however well formed: post 8 asking for post 7's.
    expect(await findTiming(bucket(1000, good), 8, KEY)).toBeNull();
    // "7" is a prefix of "70", and must not match it.
    expect(await findTiming(bucket(1000, good), 70, KEY)).toBeNull();
  });

  test("U-TIMING-2b: a key that is not an article's MP3 never reaches the bucket", async () => {
    // The endpoint takes `key` from the query string; this is what stops it
    // reading any other object. This bucket has an object of every name, with
    // a table that is internally right for whatever name is asked — so
    // nothing but the key check can say no.
    const everything: TimingBucket = {
      head: async () => ({ size: 1000 }),
      get: async (k) => ({ text: async () => JSON.stringify(table({ audio: k.replace(/\.json$/, "") })) }),
    };
    // The control: the same bucket does serve a well-formed key.
    expect(await findTiming(everything, 7, KEY)).not.toBeNull();
    for (const key of [
      "article-audio/7-abcd1234.mp3.json",
      "article-audio/7-abcd1234.mp3.txt",
      "article-audio/7-ABCD1234.mp3",
      "article-audio/7-abcd123.mp3",
      "article-audio/../secrets.mp3",
      "media/7-abcd1234.mp3",
      "",
    ]) {
      expect(await findTiming(everything, 7, key)).toBeNull();
    }
    expect(await findTiming(everything, "7/../8", KEY)).toBeNull();
  });
});

test.describe("U-TIMING lineAt", () => {
  const starts = [0, 5.5, 5.5, 20];

  test("U-TIMING-3: boundaries — before, on, between, after, and equal starts", () => {
    expect(lineAt(starts, -1)).toBe(0); // before the first start: the top
    expect(lineAt(starts, 0)).toBe(0); // exactly on a start
    expect(lineAt(starts, 5.49)).toBe(0); // just before the next
    expect(lineAt(starts, 5.5)).toBe(2); // equal starts: the later, audible line
    expect(lineAt(starts, 19.99)).toBe(2);
    expect(lineAt(starts, 20)).toBe(3);
    expect(lineAt(starts, 9999)).toBe(3); // after the last
    expect(lineAt([], 3)).toBe(-1);
    expect(lineAt([4], 1)).toBe(0);
  });
});

test.describe("U-TIMING the endpoint's decision", () => {
  test("U-TIMING-4: a good table is a 200 that round-trips; every refusal is a 404", async () => {
    const ok = await timingResponseParts(bucket(1000, JSON.stringify(table())), 7, KEY);
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.body)).toEqual(table());

    for (const parts of [
      await timingResponseParts(bucket(1000, null), 7, KEY),
      await timingResponseParts(bucket(1000, JSON.stringify(table())), 7, null),
      await timingResponseParts(bucket(1001, JSON.stringify(table())), 7, KEY),
    ]) {
      expect(parts.status).toBe(404);
    }
  });
});
