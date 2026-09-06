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
 * The rewriter, and it is NOT the model the rest of this folder uses.
 *
 * MEASURED ON THE REAL CHUNK, three ways that matter:
 *
 * | model                                   | per 10 lines | `307` becomes |
 * |-----------------------------------------|--------------|---------------|
 * | `@cf/moonshotai/kimi-k2.6`              | 106-178 s    | 三小時零七分   |
 * | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 6.8 s     | 三百零七 ✗    |
 * | `@cf/mistralai/mistral-small-3.1-24b-instruct` | 9.2 s | 三小時零七分   |
 *
 * Kimi is right and unusable: it is a reasoning model, and it spends six to
 * twelve thousand characters of `reasoning_content` deciding how to expand a
 * marathon time. Seven chunks of that is sixteen minutes for one article, and
 * no HTTP request survives it — which is exactly how the first version of this
 * feature reached production and generated nothing at all.
 *
 * Llama is fast and wrong in the one way that makes the feature pointless: it
 * renders `307` as 三百零七, which is the bug spelled out in Chinese. The
 * line-count guard cannot catch that — the count is right, the words are
 * wrong — which is why the choice was made by reading the output rather than
 * by watching the tests pass.
 *
 * Mistral does what Kimi does, at a fifteenth of the time. Both over-convert
 * plain numbers (7月 → 七月), which costs nothing: a voice says them the same.
 */
const REWRITE_MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct";

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
 * Room for the reply, and no longer for a model's thinking.
 *
 * 8,192 was sized for Kimi's `reasoning_content`, which is gone with Kimi.
 * A ten-line chunk of this corpus is around 400 characters and the rewrite
 * lengthens it rather than shortening it, so 2,048 is several times what the
 * reply needs — and a chunk that somehow wants more comes back
 * `finish_reason: "length"`, which is a refused chunk rather than a mangled
 * one.
 */
const CHUNK_MAX_TOKENS = 2048;

export function reconcileSpokenScript(original: string, reply: string): string {
  const before = original.split("\n");
  // BLANK LINES ARE STRIPPED BEFORE COUNTING, and that is a measured fix
  // rather than a loosening. Mistral returns a correct rewrite double-spaced
  // about as often as not — ten lines come back as nineteen, the extra nine
  // being empty — and the first version of this refused every one of them.
  // Two chunks in five of the Chicago article were thrown away that way, one
  // of them the chunk holding the 415 pace, and the reply was right both
  // times.
  //
  // It does not weaken the guard. A model that *loses* a sentence still comes
  // back short after stripping, and a blank standing in for a line it dropped
  // no longer disguises itself as the right count. The formatting is the one
  // thing being forgiven.
  const after = reply
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (after.length !== before.length) return original;
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
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += CHUNK_LINES) {
    chunks.push(lines.slice(i, i + CHUNK_LINES).join("\n"));
  }

  // IN PARALLEL, because the chunks are independent and doing them in turn is
  // what made this too slow to finish inside a request. Ten lines take about
  // nine seconds whatever else is happening, so a fifteen-chunk article is
  // ~10s this way and ~140s the other. `Promise.all` preserves order, and a
  // chunk that fails still degrades to its own ten lines — the failure mode
  // does not change, only the clock.
  return (await Promise.all(chunks.map((chunk) => rewriteChunk(ai, chunk)))).join("\n");
}

/** One chunk, or the chunk unchanged. Never throws — see `spokenScript`. */
async function rewriteChunk(ai: Ai, chunk: string): Promise<string> {
  try {
    const reply = await callTextModel(ai, {
      system: SYSTEM,
      text: chunk,
      maxTokens: CHUNK_MAX_TOKENS,
      model: REWRITE_MODEL,
    });
    return reconcileSpokenScript(chunk, reply);
  } catch (error) {
    console.warn("spoken-script chunk failed; narrating as written", error);
    return chunk;
  }
}
