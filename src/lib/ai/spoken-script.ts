import { callTextModel, realAIAvailable } from "./call-model";

/**
 * The article, rewritten into how it is *said* rather than how it is written.
 *
 * WHY A MODEL AND NOT MORE RULES. `src/lib/reader/pronounce.ts` is the rule
 * half, and its header records where the rules ran out: scanning the 15 real
 * articles, `H:MM` is a duration five times out of seven and a clock time the
 * other two, and a three-digit run like `307` matches 120 places in the corpus
 * that are overwhelmingly street addresses and phone numbers. Both need to
 * know what the sentence is about, which is the one thing a regex cannot ask.
 *
 * Measured on MiniMax, which is the voice this feeds: `柏林跑了307` comes out
 * as 「三百零七」. That is a marathon finish of three hours seven minutes, and
 * three hundred and seven is not a thing anybody said.
 *
 * WHAT KEEPS IT HONEST. A model asked to rewrite an article will, given the
 * chance, improve it — summarise a long paragraph, merge two short ones, add a
 * heading. Three things stop that mattering:
 *
 *   1. **It is line-for-line, and the count is checked.** The script arrives as
 *      one line per sentence, and `reconcileSpokenScript` throws the reply away
 *      if the number of lines changed. A model that dropped a sentence or
 *      merged two cannot get past that, and the fallback is the original text —
 *      which is exactly as good as not running this step at all.
 *   2. **It never reaches the page.** The output is spoken and then thrown
 *      away. Nothing here touches `posts.content`, the search index, or what a
 *      reader sees.
 *   3. **It is cached with the audio.** The script that produced a given file
 *      is the one hashed into that file's key, so a rewrite that goes wrong is
 *      replaced by regenerating, not by hunting for what was stored where.
 */

/**
 * Line-for-line, and it says so four separate ways.
 *
 * The rules are numbered because the failure that matters is the model being
 * *helpful* — 「(此處有一張圖片)」 is the shape `call-model.ts` already records
 * a mid-size model reaching for. Examples are given for the two cases actually
 * measured in this corpus rather than invented ones, so the model is being
 * shown the domain rather than told about it.
 */
const SYSTEM = [
  "你是一個把中文文章改寫成「唸出來的樣子」的工具，輸出只給語音合成使用。",
  "輸入是一行一句。規則：",
  "1. 逐行對應。輸出的行數必須和輸入完全相同，不可合併、拆分、新增或刪除任何一行。",
  "2. 只改寫「寫法和唸法不一樣」的地方，例如成績、配速：",
  "   柏林跑了307 → 柏林跑了三小時零七分",
  "   保持415左右的配速 → 保持每公里四分十五秒左右的配速",
  "   跟著300兔子 → 跟著三小時配速員",
  "   完賽時間是3:36 → 完賽時間是三小時三十六分",
  "3. 時間要看上下文。「晚上9:45」是時鐘，唸成晚上九點四十五分，不是九小時四十五分。",
  "4. 普通的數字不要動。7月、13度、30公里、2024 都照原樣留著，語音本來就會唸對。",
  "5. 專有名詞不要動。Squamish 50/50 是賽事名稱，不是數字。",
  "6. 輸出必須是繁體中文，不可以出現簡體字。",
  "7. 其餘一個字都不要改。不要摘要、不要解釋、不要加標題、不要加註解。",
  "8. 只輸出改寫後的文字本身。",
].join("\n");

/**
 * How many lines go to the model at once.
 *
 * MEASURED, and the measurement is the reason this exists at all. Kimi is a
 * reasoning model: asked to rewrite the 42-line Chicago article in one call it
 * spent **13,578 characters** of `reasoning_content` — eight times the input —
 * before writing a word of the answer. At the budget this file first shipped
 * with (four times the input) the reply came back `finish_reason: "length"`
 * with `content: ""`, which `reconcileSpokenScript` correctly refuses and
 * `spokenScript` correctly falls back from. The feature would have worked
 * exactly as designed and never rewritten a single article.
 *
 * Ten lines keeps the reasoning bounded per call whatever the article's
 * length, and it makes the failure granular: a chunk the model mangles falls
 * back to its own ten lines rather than costing the whole article its rewrite.
 */
const CHUNK_LINES = 10;

/**
 * Room for the thinking as well as the answer.
 *
 * The 8× reasoning ratio above is the number this comes from, with headroom:
 * a ten-line chunk of this corpus is around 400 characters. 4,096 was tried
 * first and measured: one chunk in five came back `finish_reason: "length"`
 * with nothing in it, and the article kept those ten lines unrewritten — the
 * degradation working, on the chunk that happened to hold the 415 pace. 8,192
 * is that number doubled. It costs nothing to raise: `max_tokens` is a
 * ceiling, and only tokens actually generated are billed.
 */
const CHUNK_MAX_TOKENS = 8192;

export function reconcileSpokenScript(original: string, reply: string): string {
  const before = original.split("\n");
  const after = reply.trim().split("\n");
  if (after.length !== before.length) return original;
  if (after.some((line) => line.trim() === "")) return original;
  return after.join("\n");
}

/**
 * The script a voice should be given for this article.
 *
 * Chunked, and every chunk reconciled on its own — see `CHUNK_LINES`. A chunk
 * the model mangles keeps its original ten lines and the rest of the article
 * still gets rewritten, which is a better failure than the all-or-nothing one
 * this had first.
 *
 * Returns the input unchanged when there is no model to call — CI and a plain
 * `pnpm dev`, per `realAIAvailable()`. That is not a stand-in pretending to
 * work: an unrewritten script is a real, correct script that says the numbers
 * the way they are written, which is what the reader does today.
 *
 * Never throws. `callTextModel` raises an `APIError` for a model that is down
 * or rate-limited, and the answer to that here is the same as to a reply that
 * failed reconciliation — narrate the article as written rather than not at
 * all.
 */
export async function spokenScript(ai: Ai, script: string): Promise<string> {
  if (!realAIAvailable()) return script;

  const lines = script.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += CHUNK_LINES) {
    const chunk = lines.slice(i, i + CHUNK_LINES).join("\n");
    out.push(await rewriteChunk(ai, chunk));
  }
  return out.join("\n");
}

/** One chunk, or the chunk unchanged. Never throws — see `spokenScript`. */
async function rewriteChunk(ai: Ai, chunk: string): Promise<string> {
  try {
    const reply = await callTextModel(ai, {
      system: SYSTEM,
      text: chunk,
      maxTokens: CHUNK_MAX_TOKENS,
    });
    return reconcileSpokenScript(chunk, reply);
  } catch (error) {
    console.warn("spoken-script chunk failed; narrating as written", error);
    return chunk;
  }
}
