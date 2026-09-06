import { APIError } from "payload";

import { MAX_SCRIPT_CHARS } from "@/lib/reader/article-audio";

/**
 * Turning a script into an MP3, through the `AI` binding this repo already has.
 *
 * WHY MINIMAX AND NOT THE MODELS THE READER'S OWN HEADER RULED OUT. That header
 * was right when it was written and is now out of date: Workers AI's own
 * catalogue still offers no Traditional Chinese voice with a choice of speaker
 * — `@cf/deepgram/aura-*` is English and Spanish, `@cf/myshell-ai/melotts` has
 * Chinese and no speaker parameter at all — but `env.AI.run` now reaches
 * third-party models through the unified catalogue, and MiniMax is one of
 * them. Four candidates were generated from the same real paragraph and
 * listened to; this is the one that was chosen.
 *
 * `Chinese (Mandarin)_Gentleman` — the parenthesised form, which matters:
 * `Chinese_Mandarin_Gentleman` is refused with `2002: Error`, and the model
 * documentation lists no voices at all, only that `voice_id` is a string with
 * an English default. The ids here were found by probing.
 *
 * IT NEEDS AI GATEWAY CREDITS. Third-party models are not billed in neurons:
 * with an empty gateway balance every call fails with
 * `2021: Insufficient AI Gateway credits`, which is what the first attempt at
 * this returned. `@cf/` models are unaffected, so a failure here does not mean
 * the binding is broken.
 */

const MODEL = "minimax/speech-2.8-hd";

/**
 * The narrator.
 *
 * A male voice, chosen by listening rather than by specification — which is
 * the whole reason this model was picked over the alternatives that offer one
 * fixed voice and no say in it. Changing it changes every article's narration,
 * so it is a constant here and not a parameter: an article narrated by
 * whichever voice happened to be configured that week is not a feature.
 */
const VOICE_ID = "Chinese (Mandarin)_Gentleman";

/**
 * What comes back is a URL, not audio.
 *
 * The gateway writes the provider's output to its own R2 and hands over a
 * presigned link with `X-Amz-Expires=86400`. So a caller that stored this
 * would have a working article for a day and a dead one after that — the
 * bytes have to be fetched and put somewhere this site owns, which is what
 * `speakArticle` does before returning.
 */
type SpeechResult = {
  state?: string;
  result?: { audio?: string };
  audio?: string;
};

/**
 * Narrate one script, and hand back the bytes.
 *
 * Throws rather than returning null: every caller's answer to "there is no
 * audio" is the same — leave whatever is already in R2 alone and try again
 * later — and that is easier to get right when the failure is loud.
 */
export async function speakArticle(ai: Ai, script: string): Promise<ArrayBuffer> {
  if (script.length > MAX_SCRIPT_CHARS) {
    // Refused here rather than at the provider, where it arrives as a
    // complaint about a field length. Speaking a long article in parts and
    // joining them is real work and a different change; this says so instead
    // of half-doing it.
    throw new APIError(
      `Script is ${script.length} characters; ${MODEL} accepts ${MAX_SCRIPT_CHARS}. Speaking an article in parts is not implemented.`,
      413,
    );
  }

  const response = (await ai.run(MODEL, {
    text: script,
    voice_id: VOICE_ID,
    format: "mp3",
    speed: 1,
    volume: 1,
    pitch: 0,
  })) as SpeechResult;

  const url = response?.result?.audio ?? response?.audio;
  if (typeof url !== "string" || !url.startsWith("http")) {
    throw new APIError(
      `${MODEL} returned no audio URL (state: ${response?.state ?? "unknown"})`,
      502,
    );
  }

  const audio = await fetch(url);
  if (!audio.ok) {
    throw new APIError(
      `Could not read the generated audio: ${audio.status}`,
      502,
    );
  }
  return audio.arrayBuffer();
}
