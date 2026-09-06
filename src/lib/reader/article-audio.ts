import { articleSegments } from "./article-text";

/**
 * Where an article's generated narration lives, and when it stops being valid.
 *
 * NO DATABASE COLUMN, AND THAT IS THE DESIGN. The obvious shape is
 * `posts.audioKey` plus `posts.audioHash`, which costs a migration — and this
 * repository's own notes are three pages long on what a D1 migration costs
 * when it goes wrong. Everything those two columns would hold is already
 * derivable: the key IS the identity, so R2 answers "is there audio for this
 * article" with a `head()`, and the hash inside the key answers "is it still
 * the right audio" without anything having to remember.
 *
 * THE HASH IS OVER WHAT WOULD BE SAID, NOT OVER THE STORED BODY. Those differ
 * more often than they look: fixing a typo in an image's alt text, reordering
 * two photographs, correcting a heading's formatting — none of them change one
 * word a listener hears, and all of them change `posts.content`. Hashing the
 * body would pay MiniMax again for identical audio each time. Hashing the
 * script also means the pipeline can grow a step (a spoken-script pass in
 * front of the voice) without this file learning about it: whatever produces
 * the final text is what gets hashed.
 *
 * A NON-CRYPTOGRAPHIC HASH, on purpose. This is a cache key, not a boundary —
 * nothing is authorised by it and nobody is kept out by it. FNV-1a is
 * synchronous, which is what lets the page's server render derive the key
 * inline; `crypto.subtle.digest` is a promise and would push an `await` into
 * every caller for a property none of them need.
 */

/** The sentences a voice would say, as one string. */
export function articleScript(title: string, content: unknown): string {
  return [title, ...articleSegments(content)].filter(Boolean).join("\n");
}

/**
 * FNV-1a, 32-bit, hex.
 *
 * Collision risk is the question worth asking of any short hash, and here the
 * population is one: two *different* scripts for the *same post id*. A
 * collision would serve the previous narration of the same article after an
 * edit — not another article's audio, since the id is in the key beside it.
 */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    // The FNV prime, by shifts: `hash * 16777619` overflows to a double and
    // stops being the same function.
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    hash >>>= 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * The R2 key for one article's narration.
 *
 * `article-audio/` is its own prefix rather than a suffix on the media keys:
 * `unusedMediaSweep` walks `media` rows and deletes objects it cannot find a
 * reference for, and an object with no row at all is exactly what it must
 * never meet. A separate prefix keeps this out of that job's way, the same
 * way `posters/` and `transcoded/` already are.
 */
export function articleAudioKey(postId: number | string, script: string): string {
  return `article-audio/${postId}-${fnv1a(script)}.mp3`;
}

/**
 * THE key for a post. Every caller goes through here — page, sweep, generator.
 *
 * IT EXISTS BECAUSE THE ALTERNATIVE SHIPPED AND FAILED SILENTLY. The generator
 * used to hash the script *after* the model rewrote it, while the page could
 * only hash the article as written — so the two computed different keys and
 * the page never found the audio. Three narrations were generated on
 * production, paid for, and were unreachable the moment they were written:
 * `22-3fdcea01.mp3` sitting in R2 while every render asked for
 * `22-75e28f51.mp3`. Nothing failed. The sweep reported success, the files
 * were real, and the article went on being read by the device.
 *
 * So the key is hashed from the article AS WRITTEN, which is the only version
 * both sides can see without paying a model. What the voice actually says is
 * stored beside the audio as `<key>.txt`.
 *
 * The cost of that choice, stated: changing the rewrite prompt or the voice
 * does not change the key, so neither regenerates anything on its own. That is
 * what `?force=true` is for, and it was already the documented reason for it.
 */
export function articleAudioKeyForPost(post: {
  id: number | string;
  title?: string | null;
  content?: unknown;
}): string {
  return articleAudioKey(post.id, articleScript(post.title ?? "", post.content));
}

/**
 * MiniMax's own ceiling — `text` is `maxLength: 10000`.
 *
 * The longest article in the corpus is 7,102 characters of script, so nothing
 * today needs splitting. Stated as a constant and checked at the call site
 * rather than assumed: an article that grows past it would otherwise fail at
 * the provider with a message about a field, and the fix (speak it in parts
 * and join them) is a different piece of work than the one that would be
 * happening at that moment.
 */
export const MAX_SCRIPT_CHARS = 10_000;

/**
 * Which objects under `article-audio/` no published article asks for.
 *
 * Separated from the bucket so the one rule with a corner in it — that a
 * `<key>.txt` is judged by the audio it belongs to, not on its own — can be
 * asserted without an R2 binding. Without that rule every healthy narration
 * reports a companion orphan, and a report where half the entries are noise is
 * a report nobody reads twice.
 */
export function orphanAudioKeys(
  keys: readonly string[],
  wanted: ReadonlySet<string>,
): string[] {
  return keys.filter((key) => {
    const audioKey = key.endsWith(".txt") ? key.slice(0, -".txt".length) : key;
    return !wanted.has(audioKey);
  });
}
