import { expect, test } from "@playwright/test";

import {
  articleAudioKey,
  articleAudioKeyForPost,
  articleScript,
  findNarration,
  orphanAudioKeys,
} from "@/lib/reader/article-audio";
import { localisePost } from "@/lib/i18n/zh-post";
import type { SitePost } from "@/lib/content-types";

/**
 * U-AUDIOKEY — the key that stands in for a database column.
 *
 * There is no `posts.audioKey`. R2 is the index: the key carries the post id
 * and a hash of the script, so one `head()` answers both "has this been
 * narrated" and "is that narration still current". Everything that design
 * saves — a migration, a column that can disagree with the bucket — it saves
 * by making these two functions load-bearing, so they are asserted rather
 * than assumed.
 *
 * The failure this guards against is silent in both directions. A key that is
 * not stable across processes means the page never finds audio that exists and
 * the generator writes a new file every run, paying MiniMax each time. A key
 * that fails to change when the words do means an edited article keeps reading
 * the old text aloud forever, while the page and the bucket both look fine.
 */

const doc = (...paragraphs: string[]) => ({
  root: {
    type: "root",
    children: paragraphs.map((text) => ({
      type: "paragraph",
      children: [{ type: "text", text }],
    })),
  },
});

test.describe("U-AUDIOKEY the key R2 is indexed by", () => {
  test("U-AUDIOKEY-1: the same script always gives the same key", () => {
    // Stability across calls is the whole premise: the page derives the key on
    // one request and the generator derived it on another, and they have to
    // agree with nothing shared between them.
    const script = articleScript("標題", doc("第一段。", "第二段。"));
    expect(articleAudioKey(7, script)).toBe(articleAudioKey(7, script));
    expect(articleAudioKey(7, script)).toMatch(/^article-audio\/7-[0-9a-f]{8}\.mp3$/);
  });

  test("U-AUDIOKEY-2: changing a word changes the key", () => {
    const before = articleScript("標題", doc("跑了三小時。"));
    const after = articleScript("標題", doc("跑了四小時。"));
    expect(articleAudioKey(7, before)).not.toBe(articleAudioKey(7, after));
  });

  test("U-AUDIOKEY-3: two posts never share a key for the same words", () => {
    // The id is in the key beside the hash, so a collision can only ever serve
    // one article its own earlier narration — never another article's.
    const script = articleScript("標題", doc("一樣的內容。"));
    expect(articleAudioKey(7, script)).not.toBe(articleAudioKey(8, script));
  });

  test("U-AUDIOKEY-4: an edit that changes nothing spoken keeps the key", () => {
    // THE PROPERTY THE WHOLE DESIGN IS FOR. `articleSegments` drops uploads, so
    // adding a photograph between two paragraphs changes `posts.content` and
    // changes not one word a listener hears. Hashing the body would pay for
    // identical audio; hashing the script does not.
    const plain = articleScript("標題", doc("第一段。", "第二段。"));
    const withPhoto = articleScript("標題", {
      root: {
        type: "root",
        children: [
          { type: "paragraph", children: [{ type: "text", text: "第一段。" }] },
          { type: "upload", relationTo: "media", value: 42 },
          { type: "paragraph", children: [{ type: "text", text: "第二段。" }] },
        ],
      },
    });
    expect(withPhoto).toBe(plain);
    expect(articleAudioKey(7, withPhoto)).toBe(articleAudioKey(7, plain));
  });

  test("U-AUDIOKEY-6: the page and the generator ask for the same key", () => {
    // THE ASSERTION THAT WAS MISSING, and its absence cost three narrations on
    // production. The generator used to hash the script the model had
    // rewritten; the page can only hash the article as written, because it
    // cannot run a model. So the two computed different keys — `22-3fdcea01`
    // was written while every render asked for `22-75e28f51` — and nothing
    // anywhere failed: the sweep reported success, the MP3s were real, and the
    // article went on being read by the device.
    //
    // `articleAudioKeyForPost` is now the only way to get one, and this pins
    // that a post is all it takes. Nothing a model produces may enter it.
    const post = { id: 22, title: "我的首50km越野", content: doc("跑了307。") };
    expect(articleAudioKeyForPost(post)).toBe(
      articleAudioKey(post.id, articleScript(post.title, post.content)),
    );
    // The same post, however its narration might have come out.
    expect(articleAudioKeyForPost(post)).toBe(articleAudioKeyForPost({ ...post }));
  });

  test("U-AUDIOKEY-11: the Simplified page asks for the key the narration was made under", () => {
    // The second way the page and the generator came apart, and the same
    // silence: on /zh-hans the page held a converted copy of the article and
    // hashed that, so a Traditional article's narration — generated from the
    // words as stored — was never found there, while the Traditional page
    // played it. The key is now worked out from the stored post and carried
    // through the conversion on `narrationKey`.
    const stored = { id: 28, title: "越野跑的邊界", content: doc("歐洲山的尺度比北美大很多。") };
    const generated = articleAudioKeyForPost(stored);

    const post = {
      ...stored,
      description: "",
      slug: "posts/x",
      slugAsParams: "x",
      published: true,
      featured: false,
      narrationKey: generated,
    } as unknown as SitePost;
    const simplified = localisePost(post, "zh-hans");

    // The conversion really does change the words — without that this test
    // could not tell the two keys apart.
    expect(simplified.title).toBe("越野跑的边界");
    expect(articleAudioKeyForPost(simplified)).not.toBe(generated);
    expect(simplified.narrationKey).toBe(generated);
  });

  test("U-AUDIOKEY-12: an edited article plays its newest earlier narration until the new one exists", async () => {
    // Post 28 on production, 2026-09-27: re-published to add a clause, and the
    // page fell back to the device's voice while the previous MP3 sat in R2.
    // Post 2 is here because its prefix is post 28's without the dash, and a
    // `.txt` because every narration has its script beside it.
    const objects = [
      { key: "article-audio/28-aaaaaaaa.mp3", uploaded: new Date("2026-09-25T08:00:00Z") },
      { key: "article-audio/28-bbbbbbbb.mp3", uploaded: new Date("2026-09-26T01:00:00Z") },
      { key: "article-audio/28-bbbbbbbb.mp3.txt", uploaded: new Date("2026-09-26T01:00:01Z") },
      { key: "article-audio/2-cccccccc.mp3", uploaded: new Date("2026-09-24T09:00:00Z") },
    ];
    const bucket = (present: typeof objects) => ({
      head: async (key: string) => (present.some((o) => o.key === key) ? ({} as R2Object) : null),
      list: async (options?: R2ListOptions) =>
        ({
          objects: present.filter((o) => o.key.startsWith(options?.prefix ?? "")),
          truncated: false,
        }) as unknown as R2Objects,
    });
    const current = "article-audio/28-dddddddd.mp3";

    expect(await findNarration(bucket(objects), 28, current)).toEqual({
      key: "article-audio/28-bbbbbbbb.mp3",
      stale: true,
    });

    // Once generated, the current one wins however new the others are.
    const generated = [...objects, { key: current, uploaded: new Date("2026-09-20T00:00:00Z") }];
    expect(await findNarration(bucket(generated), 28, current)).toEqual({ key: current, stale: false });

    // The other direction is the dangerous one: post 2 must not take post
    // 28's newer files for its own.
    expect(await findNarration(bucket(objects), 2, "article-audio/2-ffffffff.mp3")).toEqual({
      key: "article-audio/2-cccccccc.mp3",
      stale: true,
    });

    // Never narrated: nothing to stand in, and the device reads it.
    expect(await findNarration(bucket(objects), 3, "article-audio/3-eeeeeeee.mp3")).toBeNull();
  });

  test("U-AUDIOKEY-7: a missing title or body is still a key, not a crash", () => {
    // Both arrive from a `select`ed Payload document, where either can be null.
    expect(articleAudioKeyForPost({ id: 1 })).toMatch(/^article-audio\/1-[0-9a-f]{8}\.mp3$/);
    expect(articleAudioKeyForPost({ id: 1, title: null, content: null })).toMatch(
      /^article-audio\/1-[0-9a-f]{8}\.mp3$/,
    );
  });

  test("U-AUDIOKEY-5: the title is part of what is said", () => {
    // The reader says the title first so a listener knows what they are
    // hearing, which makes it part of the script and therefore of the key —
    // renaming an article has to regenerate its narration.
    const body = doc("同樣的內文。");
    expect(articleAudioKey(7, articleScript("舊標題", body))).not.toBe(
      articleAudioKey(7, articleScript("新標題", body)),
    );
  });

  test("U-AUDIOKEY-8: a script file is judged by the audio it belongs to", () => {
    // The one corner in the orphan rule. Every narration is two objects —
    // `<key>.mp3` and `<key>.mp3.txt` — so a `.txt` weighed on its own would
    // never be in the wanted set, and every healthy article would report a
    // companion orphan. A report where half the entries are noise is a report
    // nobody reads twice.
    const wanted = new Set(["article-audio/7-abcd1234.mp3"]);
    expect(
      orphanAudioKeys(
        ["article-audio/7-abcd1234.mp3", "article-audio/7-abcd1234.mp3.txt"],
        wanted,
      ),
    ).toEqual([]);
  });

  test("U-AUDIOKEY-9: an unwanted narration is reported with its script", () => {
    // Exactly the shape production produced: the key changed, so both halves
    // of the old pair became unreachable together.
    const wanted = new Set(["article-audio/22-75e28f51.mp3"]);
    expect(
      orphanAudioKeys(
        [
          "article-audio/22-75e28f51.mp3",
          "article-audio/22-75e28f51.mp3.txt",
          "article-audio/22-3fdcea01.mp3",
          "article-audio/22-3fdcea01.mp3.txt",
        ],
        wanted,
      ),
    ).toEqual([
      "article-audio/22-3fdcea01.mp3",
      "article-audio/22-3fdcea01.mp3.txt",
    ]);
  });

  test("U-AUDIOKEY-10: nothing wanted means nothing is spared", () => {
    // The control. Without it every assertion above would also pass for a
    // function that returned an empty list, which is what a wrong `wanted`
    // lookup produces — and an orphan report that always says "none" is the
    // silent failure this whole prefix already had.
    expect(
      orphanAudioKeys(["article-audio/1-aaaaaaaa.mp3"], new Set()),
    ).toEqual(["article-audio/1-aaaaaaaa.mp3"]);
  });
});
