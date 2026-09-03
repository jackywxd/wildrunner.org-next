import { expect, test } from "@playwright/test";

import { articleSegments } from "@/lib/reader/article-text";

/**
 * U-READER — what a voice is given to say, out of a stored article body.
 *
 * EVERY CASE HERE CAME FROM RUNNING IT OVER THE REAL CORPUS, not from reading
 * the schema. The first version passed a hand-written fixture and was wrong in
 * three ways that only 15 real articles showed: a YouTube link read out
 * character by character, English prose never splitting into sentences at all,
 * and URLs inside sentences splitting at their own `?`. Each is a case below.
 */

const doc = (children: unknown[]) => ({ root: { type: "root", children } });
const para = (...text: string[]) => ({
  type: "paragraph",
  children: text.map((t) => ({ type: "text", text: t })),
});

test.describe("U-READER an article body becomes the sentences a voice says", () => {
  test("U-READER-1: an image is silent and does not interrupt the paragraphs around it", () => {
    // Uploads are 111 of the nodes across the 15 seeded posts — a third of
    // everything — and reading their alt text would be a hundred
    // interruptions. No skip list makes that true: measured over those 111
    // nodes, not one carries `children`, so an upload has no text to find. The
    // claim worth pinning is therefore the sequence — that the walk continues
    // *past* it and the two paragraphs stay adjacent and in order.
    expect(
      articleSegments(
        doc([
          para("跑完了。"),
          { type: "upload", value: { alt: "終點線" } },
          para("很累。"),
        ]),
      ),
    ).toEqual(["跑完了。", "很累。"]);
  });

  test("U-READER-2: a paragraph that is only a YouTube link is a video, not a sentence", () => {
    // Found by measurement: the corpus returned "https://www.youtube.com/watch?"
    // and "v=hmidfqoX6cc" as two separate things to say. The page swaps that
    // paragraph for a player, so the voice must skip what the eye never reads.
    // Shares `soleYouTubeUrl` with the renderer and the member preview rather
    // than testing a fourth copy of the rule.
    expect(
      articleSegments(
        doc([
          para("https://www.youtube.com/watch?v=hmidfqoX6cc"),
          para("接著跑。"),
        ]),
      ),
    ).toEqual(["接著跑。"]);
  });

  test("U-READER-3: a sentence keeps the mark that ends it", () => {
    // `。」` is one ending, not two: a voice needs the fall the mark asks for.
    expect(articleSegments(doc([para("他說「跑吧。」然後就走了。")]))).toEqual([
      "他說「跑吧。」",
      "然後就走了。",
    ]);
  });

  test("U-READER-4: a full stop splits English prose but never a decimal", () => {
    // Leaving `.` out entirely was the first version. The corpus has English
    // articles, and they never split at all — they were hard-cut mid-word at
    // the cap instead, 5 segments of 750. Requiring whitespace after the stop
    // is what separates "in Canada. It's" from "3.5 公里" and "utmb.world".
    expect(
      articleSegments(
        doc([para("Held in Canada. It is 3.5 km. See utmb.world now")]),
      ),
    ).toEqual(["Held in Canada.", "It is 3.5 km.", "See utmb.world now"]);
  });

  test("U-READER-5: a URL inside a sentence is shown but never said", () => {
    // Four of these in the corpus. A voice can only recite a URL character by
    // character, and this one also split at its own `?`.
    expect(
      articleSegments(
        doc([para("比賽視頻 https://www.youtube.com/watch?v=abc 很好看。")]),
      ),
    ).toEqual(["比賽視頻 很好看。"]);
  });

  test("U-READER-6: each list item is said on its own", () => {
    // 31 lists and 61 items in the corpus. Recursion has to continue *through*
    // a block-level node, or every bulleted list is read as one run-on line.
    expect(
      articleSegments(
        doc([
          {
            type: "list",
            children: [
              { type: "listitem", children: [{ type: "text", text: "水" }] },
              { type: "listitem", children: [{ type: "text", text: "鹽" }] },
            ],
          },
        ]),
      ),
    ).toEqual(["水", "鹽"]);
  });

  test("U-READER-7: a body it cannot read says nothing rather than throwing", () => {
    // The body is JSON out of the database, and a post written before any
    // given editor change is still a post. A reader that refuses to start on
    // one odd node is worse than one that skips it.
    expect(articleSegments(null)).toEqual([]);
    expect(articleSegments({})).toEqual([]);
    expect(articleSegments("not a document")).toEqual([]);
    expect(articleSegments(doc([{ type: "mystery-block", foo: 1 }]))).toEqual(
      [],
    );
  });

  test("U-READER-8: a sentence that never ends is still finite", () => {
    // Three segments in the corpus reach this — a Chinese run-on separated
    // only by commas, and a stats block. Splitting one anywhere is a
    // compromise; splitting it nowhere risks the remainder going unsaid.
    const runOn = "跑".repeat(400);
    const segments = articleSegments(doc([para(runOn)]));
    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments)
      expect(segment.length).toBeLessThanOrEqual(180);
    expect(segments.join("")).toBe(runOn);
  });
});
