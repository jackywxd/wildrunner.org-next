import { expect, test } from "@playwright/test";

import {
  editDistance,
  rewriteKeepsWords,
  speakable,
  tidyPauses,
  type Wav,
} from "../../scripts/lib/narration-check";
import {
  articleBlocks,
  attempt,
  numberSpoken,
  packBlocks,
  piecesToStarts,
} from "../../scripts/lib/narration-timing";

/**
 * U-NARRATE — the checks that decide whether a locally narrated piece is
 * published or regenerated.
 *
 * Each of these stands between a fault and ten hours of audio nobody will
 * listen to end to end, and each fault is one that post 31's narration
 * actually had when it was transcribed back: an emoji spoken as a sound with
 * the words before it lost, four characters skipped, `16-18公里` said as
 * nonsense, and a paragraph full of second-long pauses. A wrong answer from
 * any of them is invisible — the MP3 still plays — which is why they are
 * pinned here rather than trusted.
 */

test.describe("U-NARRATE what the voice is given", () => {
  test("U-NARRATE-1: emoji are removed and the words around them kept", () => {
    // The sentence from post 31: the voice said 「嗯」 for ❤️ and dropped
    // 加油打气 before it.
    expect(speakable("诚心赶鸭子上架，加油打气❤️，也感谢纽约华人跑团联盟周到细致的服务🌹。")).toBe(
      "诚心赶鸭子上架，加油打气，也感谢纽约华人跑团联盟周到细致的服务。",
    );
    // A joined family, a flag and a keycap leave nothing behind either —
    // what remains of a sequence is exactly what a voice would make a sound for.
    expect(speakable("我们👨‍👩‍👧一家🇨🇦，第1️⃣次")).toBe("我们一家，第1次");
  });

  test("U-NARRATE-2: a sentence without emoji is unchanged", () => {
    const plain = "如果说跑马是来纽约的目的，那么身临其境去看 High Line 高线公园。";
    expect(speakable(plain)).toBe(plain);
  });

  test("U-NARRATE-14: a dash opening a sentence goes, a dash inside one stays", () => {
    // Post 33's subtitle: the voice opened it with laughter four times running.
    expect(speakable("——2026 UTMB Mont-Blanc百英里纪实")).toBe("2026 UTMB Mont-Blanc百英里纪实");
    expect(speakable("此前已经无数次听别人提起过TMB——Tour du Mont Blanc。")).toBe(
      "此前已经无数次听别人提起过TMB——Tour du Mont Blanc。",
    );
  });
});

test.describe("U-NARRATE comparing what was heard with what was meant", () => {
  test("U-NARRATE-3: the recogniser's homophones are not counted against the voice", () => {
    // Post 31, piece 10, transcribed by Qwen3-ASR. Compared as characters this
    // scored as badly as a piece with four characters skipped.
    expect(
      editDistance(
        "据说，如果你爱一个人，就让他来跑纽马；如果恨一个人，也让他来跑一次纽马。于我，纽马就像它那些长长短短、高高低低的桥和坡。",
        "据说，如果你爱一个人，就让他来跑牛马；如果恨一个人，也让他来跑一次牛马。与我，牛马就像他那些长长短短、高高低低的桥和坡。",
      ),
    ).toBe(0);
  });

  test("U-NARRATE-4: characters the voice skipped are counted, each one", () => {
    // Post 31, piece 2: 「七大马里」 never said. Three, not four — 七 is a
    // numeral, and numerals are not compared (see `NUMERALS`), so this is the
    // price of not failing every piece on how a number was read.
    expect(editDistance("纽约据说是七大马里最难的，因为有五座大桥。", "纽约据说是最难的，因为有五座大桥。")).toBe(3);
  });

  test("U-NARRATE-5: sounds the voice invented are counted, however short the slip", () => {
    // Post 31, piece 4 before the rewrite: two wrong sounds in a long
    // paragraph, which as a fraction of it looked like nothing.
    expect(editDistance("只有十六到十八公里左右，周遭突然安静下来。", "只有十六，毫无公里左右，周遭突然安静下来。")).toBe(2);
  });

  test("U-NARRATE-6: how a number is written does not count, nor does script or punctuation", () => {
    expect(editDistance("一出发就爬长达3公里的桥", "一出发就爬长达三公里的桥。")).toBe(0);
    expect(editDistance("跑過紐約了", "跑过纽约了！")).toBe(0);
  });

  test("U-NARRATE-16: 的, 地 and 得 heard for one another are not counted", () => {
    // Post 33 with uncle_fu: said correctly, written by the recogniser as 的,
    // and failed for it before this.
    expect(
      editDistance("岩石杂乱地堆叠在斜坡上，另一些则松松地嵌在泥土里。", "岩石杂乱的堆叠在斜坡上，另一些则松松的嵌在泥土里。"),
    ).toBe(0);
  });

  test("U-NARRATE-7: a misspelt English name is one mistake, not one per letter", () => {
    expect(editDistance("爬 Verrazzano-Narrows Bridge 到 Brooklyn", "爬Verazano Narrows Bridge到Brooklyn")).toBe(1);
  });
});

test.describe("U-NARRATE a rewrite may only change how numbers are said", () => {
  test("U-NARRATE-8: the rewrites the prompt asks for are accepted", () => {
    // The prompt's own examples in spoken-script.ts, and ones the local model
    // produced for posts 31 and 33.
    for (const [original, rewritten] of [
      ["柏林跑了307，保持415左右的配速。", "柏林跑了三小时零七分，保持每公里四分十五秒左右的配速。"],
      ["终于万国旗进入视野，3:24完赛。", "终于万国旗进入视野，三小时二十四分完赛。"],
      ["只有16-18公里左右，周遭突然安静下来。", "只有十六到十八公里左右，周遭突然安静下来。"],
      ["时间已经是晚上9:45了。", "时间已经是晚上九点四十五分了。"],
      ["虽然在上一个计时点还排在404名", "虽然在上一个计时点还排在第四百零四名"],
    ]) {
      expect(rewriteKeepsWords(original, rewritten), rewritten).toBe(true);
    }
  });

  test("U-NARRATE-9: a rewrite that adds or drops words is refused", () => {
    // A year the model left alone earns no allowance, so it cannot pay for a
    // clause the article never had.
    expect(rewriteKeepsWords("2022年年底，我坐在电脑前。", "2022年年底，我坐在电脑前，看着窗外的雪。")).toBe(false);
    expect(rewriteKeepsWords("我在3:36完赛，比去年快了很多。", "我在三小时三十六分完赛。")).toBe(false);
  });

  test("U-NARRATE-15: a rewrite that says a number wrongly by replacing a word is refused", () => {
    // Post 33, all accepted by the first version of this check — fluent, and
    // wrong about a hundred-mile race finished in under thirty hours.
    for (const [original, rewritten] of [
      ["这一刻，我第一次真正确信，Sub 30已经没有问题了。", "这一刻，我第一次真正确信，三小时以内已经没有问题了。"],
      ["很可能会成为决定我能否在30小时内完赛的关键。", "很可能会成为决定我能否在三十分钟内完赛的关键。"],
      ["累计用时23小时32分09秒", "累计用时二十三日三十二分零九秒"],
      ["从2022年第一次通过视频认识UTMB", "从二零二二年第一次透过影片认识UTMB"],
      // The prompt's own example replaces a word, so it is refused too.
      ["跟着300兔子", "跟着三小时配速员"],
    ]) {
      expect(rewriteKeepsWords(original, rewritten), rewritten).toBe(false);
    }
  });
});

test.describe("U-NARRATE pauses inside a piece", () => {
  // 1 kHz, so one 10 ms frame is ten samples and lengths read as milliseconds.
  const speech = (ms: number) => new Int16Array(ms).fill(10000);
  const silence = (ms: number) => new Int16Array(ms);
  const wav = (...parts: Int16Array[]): Wav => {
    const samples = new Int16Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      samples.set(part, offset);
      offset += part.length;
    }
    return { rate: 1000, samples };
  };
  const loud = (samples: Int16Array) => samples.filter((value) => value !== 0).length;

  test("U-NARRATE-10: a long pause is shortened and every bit of speech kept", () => {
    const before = wav(speech(300), silence(1200), speech(400));
    const after = tidyPauses(before, { maxPause: 0.5, edge: 0.05 });
    expect(after.samples.length).toBe(300 + 500 + 400);
    expect(loud(after.samples)).toBe(loud(before.samples));
  });

  test("U-NARRATE-11: a pause already short enough is left exactly as it is", () => {
    const before = wav(speech(300), silence(400), speech(300));
    expect(tidyPauses(before, { maxPause: 0.5, edge: 0.05 }).samples).toEqual(before.samples);
  });

  test("U-NARRATE-12: silence at either end is trimmed to the edge", () => {
    // The gap the script inserts between pieces is then the only gap.
    const after = tidyPauses(wav(silence(900), speech(200), silence(700)), { maxPause: 0.5, edge: 0.05 });
    expect(after.samples.length).toBe(50 + 200 + 50);
  });

  test("U-NARRATE-13: a piece with no speech at all comes back empty", () => {
    expect(tidyPauses(wav(silence(800)), { maxPause: 0.5, edge: 0.05 }).samples.length).toBe(0);
  });
});

/**
 * U-NARRATE timing — the per-line start times `narrate-local` writes beside the
 * MP3. A wrong table is invisible: the file plays, the page highlights a
 * paragraph, and it is the wrong one.
 */
test.describe("U-NARRATE the timing table", () => {
  // Two sentences with the same number of syllables, so a split inside a piece
  // is exactly half. (Not numerals: `comparable` drops those.)
  const four = ["跑步训练", "山路越野"];
  const pieces = [
    { seconds: 10, gapAfter: 0.5, lines: [0], sentences: ["山路越野"] },
    { seconds: 20, gapAfter: 0.25, lines: [1, 2], sentences: four },
    { seconds: 6, gapAfter: 0.8, lines: [3], sentences: ["跑步训练"] },
  ];

  test("U-NARRATE-17: piece starts are exact; gaps, tempo, last piece and scaling are accounted for", () => {
    // At 2x the pieces last 5, 10 and 3 s, and the gaps (0.5, 0.25) are part
    // of the stream the tempo is applied to, so they halve too. A at 0;
    // B at 5 + 0.25; B's second sentence halfway through B's 10 s; C at
    // 5.25 + 10 + 0.125. The 0.8 s after C is not in the file.
    expect(piecesToStarts(pieces, 2, 18.375, 4)).toEqual([0, 5.25, 10.25, 15.38]);
    // Nothing is scaled when the measure agrees exactly.
    expect(piecesToStarts(pieces, 1, 36.75, 4)).toEqual([0, 10.5, 20.5, 30.75]);

    // Encoder padding: 0.2 s longer than the arithmetic. Scaled, and still
    // non-decreasing and inside the file.
    const scaled = piecesToStarts(pieces, 2, 18.575, 4);
    expect(scaled[0]).toBe(0);
    expect(scaled[3]).toBeCloseTo(15.375 * (18.575 / 18.375), 2);
    expect(scaled).toEqual([...scaled].sort((a, b) => a - b));
    expect(scaled[3]).toBeLessThanOrEqual(18.575);

    // A line no piece speaks (an emoji on its own) shares the next spoken
    // start; a trailing one sits at the end of the file.
    expect(piecesToStarts([pieces[0], { ...pieces[2], lines: [2] }], 1, 16.5, 4)).toEqual([0, 10.5, 10.5, 16.5]);
  });

  test("U-NARRATE-17b: pieces that do not add up to the MP3 are refused, not stretched to fit", () => {
    // The wrong tempo is the realistic mistake, and over seven hours a stretch
    // would put the end of the table minutes out.
    expect(() => piecesToStarts(pieces, 1, 18.375, 4)).toThrow(/add up/);
    expect(() => piecesToStarts(pieces, 2, 19.0, 4)).toThrow(/add up/);
    expect(() => piecesToStarts(pieces, 2, 18.375 + 0.49, 4)).not.toThrow();
    expect(() => piecesToStarts([{ ...pieces[0], lines: [9] }], 1, 10, 4)).toThrow(/line 9/);
  });

  test("U-NARRATE-17c: a refused table is a reason, not an exception, so the MP3 keeps its commands", () => {
    const refused = attempt(() => piecesToStarts(pieces, 1, 18.375, 4));
    expect("refused" in refused && refused.refused).toMatch(/add up/);
    const fine = attempt(() => piecesToStarts(pieces, 2, 18.375, 4));
    expect("value" in fine && fine.value).toEqual([0, 5.25, 10.25, 15.38]);
  });

  const para = (text: string) => ({ type: "paragraph", children: [{ type: "text", text }] });
  const doc = (...children: unknown[]) => ({ root: { type: "root", children } });

  test("U-NARRATE-18: a sentence keeps its line through speakable and pack", () => {
    const written = articleBlocks("標題", doc(para("第一段。"), para("第二段。"), para("第三段。第四段。")));
    expect(written).toEqual([["標題"], ["第一段。"], ["第二段。"], ["第三段。", "第四段。"]]);

    // What the voice is given after the rewrite: line 2 has become only an
    // emoji, which `speakable` empties. (`articleSegments` already drops most
    // such sentences, so this is the rewrite's doing or a future change's;
    // either way the numbering must not depend on it.) Counting lines after
    // the drop would number the last block 2, 3 instead of 3, 4, and every
    // start after it would sit one line early.
    const spoken = [["標題"], ["第一段。"], ["😀"], ["第三段。", "第四段。"]];
    const numbered = numberSpoken(spoken);
    expect(numbered.map((block) => block.map((s) => s.line))).toEqual([[0], [1], [], [3, 4]]);

    const limits = { maxChars: 100, chunkGap: 0.35, blockGap: 0.8 };
    const chunks = packBlocks(numbered, limits);
    expect(chunks.map((c) => c.lines)).toEqual([[0], [1], [3, 4]]);
    expect(chunks[2].sentences).toEqual(["第三段。", "第四段。"]);
    expect(chunks.map((c) => c.gapAfter)).toEqual([0.8, 0.8, 0.8]);

    // A block too long for one request splits, with the short gap between the
    // halves, and each half keeps its own lines.
    const split = packBlocks(numbered, { ...limits, maxChars: 5 });
    expect(split.map((c) => c.lines)).toEqual([[0], [1], [3], [4]]);
    expect(split.map((c) => c.gapAfter)).toEqual([0.8, 0.8, 0.35, 0.8]);
  });

  test("U-NARRATE-18b: a split that is not articleScript line for line is refused", () => {
    // A title with a newline is two lines of the script and one sentence of
    // the split. The old whitespace-stripped comparison called that equal.
    expect(() => articleBlocks("上\n下", doc(para("內文。")))).toThrow(/line for line/);
    // No title: no title line, and the body is line 0.
    expect(articleBlocks("", doc(para("內文。")))).toEqual([["內文。"]]);
  });
});
