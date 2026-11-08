import { expect, test } from "@playwright/test";

import {
  articleSegments,
  assignSegments,
  leafBlocks,
  narrationPlan,
} from "@/lib/reader/article-text";
import {
  canFollow,
  readingBand,
  scrollDelta,
  targetForLine,
} from "@/lib/reader/narration-follow";
import { toSimplifiedRichText } from "@/lib/i18n/zh-post";

/**
 * U-FOLLOW — which paragraph is highlighted while the voice reads.
 *
 * A wrong answer here is not an error anywhere: the audio plays, a paragraph
 * lights up, and it is the wrong one, stated with full confidence. So each case
 * is a way for the numbering to drift while every page still renders.
 */

const text = (t: string) => ({ type: "text", text: t });
const para = (...t: string[]) => ({ type: "paragraph", children: t.map(text) });
const heading = (t: string) => ({ type: "heading", tag: "h2", children: [text(t)] });
const quote = (t: string) => ({ type: "quote", children: [text(t)] });
const item = (t: string) => ({ type: "listitem", children: [text(t)] });
const list = (...items: unknown[]) => ({ type: "list", tag: "ul", children: items });
const doc = (children: unknown[]) => ({ root: { type: "root", children } });

/**
 * The leaf blocks, then the tree they sit in. Sentences per block: 2, 1, 0 (a
 * video), 3, 1, 1, 1 — the list's two items are leaves, the list is not.
 */
const leaves = {
  intro: para("第一句。第二句。"),
  heading: heading("小標題"),
  video: para("https://www.youtube.com/watch?v=hmidfqoX6cc"),
  body: para("甲。乙。丙。"),
  one: item("項目一。"),
  two: item("項目二。"),
  quote: quote("引言。"),
};
const stored = () =>
  doc([
    leaves.intro,
    leaves.heading,
    leaves.video,
    leaves.body,
    { type: "upload", value: { alt: "圖" } },
    list(leaves.one, leaves.two),
    leaves.quote,
  ]);

/** The tag of every block in the tree, in document order, undefined where there is none. */
function tags(tree: unknown, plan: ReturnType<typeof narrationPlan>) {
  const map = assignSegments(tree, plan);
  return map ? leafBlocks(tree).map((leaf) => map.get(leaf)) : null;
}

test.describe("U-FOLLOW the page and the script agree on which block is which", () => {
  test("U-FOLLOW-1: Simplified tags the same blocks with the same numbers, and a video neither gets one nor shifts the rest", () => {
    const tree = stored();
    const plan = narrationPlan("標題", tree);
    expect(plan).toEqual({ titled: true, blocks: [2, 1, 0, 3, 1, 1, 1] });

    const traditional = tags(tree, plan);
    // 0 + 2 sentences = 2; the heading is 1 (→ 3); the video is 0 and untagged;
    // the next block starts at 3, not 4.
    expect(traditional).toEqual([0, 2, undefined, 3, 6, 7, 8]);

    // The Simplified site renders a CONVERTED COPY: same shape, new objects.
    // A map built from the stored tree's nodes would find none of them.
    const simplified = toSimplifiedRichText(tree);
    expect(leafBlocks(simplified)[0]).not.toBe(leafBlocks(tree)[0]);
    expect(tags(simplified, plan)).toEqual(traditional);

    // Against an oracle that does not use the plan: the number on a block is
    // how many sentences the document says BEFORE it. The fixture's own leaf
    // objects are in the tree, so the stored tree can be asked directly.
    const map = assignSegments(tree, plan)!;
    const ordered = Object.values(leaves);
    ordered.forEach((leaf, i) => {
      if (leaf === leaves.video) {
        expect(map.has(leaf)).toBe(false);
        return;
      }
      expect(map.get(leaf)).toBe(articleSegments(doc(ordered.slice(0, i))).length);
    });
  });

  test("U-FOLLOW-2: a tree that does not match the plan is tagged nowhere, and the plan adds up to the script", () => {
    const tree = stored();
    const plan = narrationPlan("標題", tree)!;

    // The sum is the script's own length — the property that makes line n of
    // the audio body sentence n - titled.
    expect(plan.blocks.reduce((a, b) => a + b, 0)).toBe(articleSegments(tree).length);
    expect(narrationPlan("", tree)!.titled).toBe(false);

    // One block more or fewer in the tree being rendered: every number after
    // it would be off, so nothing is tagged.
    const extra = doc([...tree.root.children, para("多出來的一段。")]);
    expect(assignSegments(extra, plan)).toBeNull();
    const fewer = doc(tree.root.children.slice(0, -1));
    expect(assignSegments(fewer, plan)).toBeNull();
    // No plan (stale narration, print page): nothing to tag.
    expect(assignSegments(tree, null)).toBeNull();
    expect(assignSegments(tree, undefined)).toBeNull();
  });

  test("U-FOLLOW-3: a script line maps to the last block that starts at or before it, and line 0 is the title only when there is one", () => {
    // Blocks start at sentences 0, 2, 3, 6.
    const segs = [0, 2, 3, 6];
    expect(targetForLine(segs, 0, true)).toEqual({ kind: "title" });
    expect(targetForLine(segs, 1, true)).toEqual({ kind: "block", index: 0 });
    // Sentence 2 starts block 1 exactly; sentence 1 is still block 0.
    expect(targetForLine(segs, 2, true)).toEqual({ kind: "block", index: 0 });
    expect(targetForLine(segs, 3, true)).toEqual({ kind: "block", index: 1 });
    expect(targetForLine(segs, 99, true)).toEqual({ kind: "block", index: 3 });
    // Untitled: line 0 is already body sentence 0.
    expect(targetForLine(segs, 0, false)).toEqual({ kind: "block", index: 0 });
    expect(targetForLine(segs, 2, false)).toEqual({ kind: "block", index: 1 });
    // Nothing tagged, or a nonsense line: nothing to show.
    expect(targetForLine([], 3, true)).toBeNull();
    expect(targetForLine(segs, -1, true)).toBeNull();
  });

  test("U-FOLLOW-4: a table drives the page only when every check passes", () => {
    const ok = {
      timing: { lines: 120, duration: 120 },
      expectedLines: 120,
      audioDuration: 120.4,
      segCount: 30,
    };
    expect(canFollow(ok)).toBe(true);
    // Another script: every line after the difference is the wrong paragraph.
    expect(canFollow({ ...ok, expectedLines: 119 })).toBe(false);
    // Audio replaced under the same key: 1 s of slack, or 0.5% of a long file.
    expect(canFollow({ ...ok, audioDuration: 121.1 })).toBe(false);
    expect(
      canFollow({ ...ok, timing: { lines: 120, duration: 27000 }, audioDuration: 27100 }),
    ).toBe(true);
    expect(
      canFollow({ ...ok, timing: { lines: 120, duration: 27000 }, audioDuration: 27200 }),
    ).toBe(false);
    // Nothing on the page to highlight; a duration the player has not learned.
    expect(canFollow({ ...ok, segCount: 0 })).toBe(false);
    expect(canFollow({ ...ok, audioDuration: NaN })).toBe(false);
  });

  test("U-FOLLOW-5: the page moves only for a block outside the reading band", () => {
    // Header bottom 66, player 60 tall, 800 px viewport: the band starts 16 px
    // under both and covers 45% of what is left below that.
    const band = readingBand(66, 60, 800);
    expect(band.top).toBe(142);
    expect(band.bottom).toBeCloseTo(142 + (800 - 142) * 0.45, 5);

    expect(scrollDelta(142, band)).toBeNull();
    expect(scrollDelta(band.bottom, band)).toBeNull();
    // Under the player: scroll UP by the overlap so the block's top lands on the band's.
    expect(scrollDelta(100, band)).toBe(-42);
    // Below the band: scroll down until its top reaches the band's.
    expect(scrollDelta(700, band)).toBe(700 - 142);
  });
});
