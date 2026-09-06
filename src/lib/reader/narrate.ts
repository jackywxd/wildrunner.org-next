import { speakArticle } from "@/lib/ai/speak";
import { spokenScript } from "@/lib/ai/spoken-script";

import { articleAudioKey, articleScript } from "./article-audio";

/**
 * Narrate one article into R2, or report that it is already there.
 *
 * Extracted the moment there were two callers — the single-article endpoint
 * and the sweep — because the order of the steps is the part that is easy to
 * get wrong and expensive to get wrong twice: the rewrite has to happen
 * *before* the key is computed, since the rewritten text is both what gets
 * spoken and what gets hashed. Reversed, the key would name a script that is
 * not the one in the audio, and every check downstream would agree with
 * itself while being wrong.
 */

export type NarrationOutcome = {
  key: string;
  /** Characters actually sent to the voice — what MiniMax bills on. */
  chars: number;
  /** True when the audio was already in R2 and nothing was generated. */
  skipped: boolean;
  /** Whether the model's rewrite was accepted; false means narrated as written. */
  rewritten: boolean;
  bytes?: number;
};

export async function narrateArticle(
  ai: Ai,
  bucket: R2Bucket,
  post: { id: number | string; title?: string | null; content?: unknown },
  options: { force?: boolean } = {},
): Promise<NarrationOutcome> {
  const script = articleScript(post.title ?? "", post.content);
  if (!script.trim()) {
    throw new Error(`Post ${post.id} has nothing to say.`);
  }

  const spoken = await spokenScript(ai, script);
  const key = articleAudioKey(post.id, spoken);

  if (!options.force && (await bucket.head(key))) {
    return { key, chars: spoken.length, skipped: true, rewritten: spoken !== script };
  }

  const audio = await speakArticle(ai, spoken);
  await bucket.put(key, audio, {
    httpMetadata: {
      contentType: "audio/mpeg",
      // Immutable because the key changes whenever the words do — the hash is
      // in it. A reader who has the file has the right file forever.
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  // The script beside the audio, under the same key, so a narration that reads
  // wrongly can be diagnosed by reading what was actually sent rather than by
  // regenerating and hoping. Two kilobytes against an MP3.
  await bucket.put(`${key}.txt`, spoken, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });

  return {
    key,
    chars: spoken.length,
    skipped: false,
    rewritten: spoken !== script,
    bytes: audio.byteLength,
  };
}
