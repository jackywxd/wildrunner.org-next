import { expect, test } from "@playwright/test";

import {
  articleAudioKey,
  articleAudioKeyForPost,
  articleScript,
} from "@/lib/reader/article-audio";

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
});
