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
  "2. 只改寫「寫法和唸法不一樣」的地方，例如成績、配速、單位縮寫：",
  "   柏林跑了307 → 柏林跑了三小時零七分",
  "   保持415左右的配速 → 保持每公里四分十五秒左右的配速",
  "   跟著300兔子 → 跟著三小時配速員",
  "   完賽時間是3:36 → 完賽時間是三小時三十六分",
  "3. 時間要看上下文。「晚上9:45」是時鐘，唸成晚上九點四十五分，不是九小時四十五分。",
  "4. 其餘一個字都不要改。不要摘要、不要解釋、不要加標題、不要加註解。",
  "5. 只輸出改寫後的文字本身。",
].join("\n");

/**
 * Roughly four times the script's characters, and the reason is the rewrite
 * direction: `307` is three characters in and six out, so a budget sized on
 * the input alone truncates the reply on exactly the articles this exists for.
 */
function budgetFor(script: string): number {
  return Math.min(8192, Math.max(1024, Math.ceil(script.length * 4)));
}

/**
 * Accept the rewrite, or keep the original — never a mixture.
 *
 * Pure, and separate from the call, because this is the whole safety argument
 * and it should be assertable without a model. The check is the line count and
 * nothing cleverer: a per-line similarity score would be a second thing that
 * can be wrong, and the failure it would catch beyond this one — a model that
 * rewrites a line into something unrelated while keeping the count — is not a
 * failure any threshold distinguishes from a legitimate expansion of `307`.
 *
 * An empty reply, a reply with a different number of lines, or a reply that
 * has clearly been prefaced ("好的，以下是…") all fail the same way and all
 * produce the same answer: say what the article actually says.
 */
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
  try {
    const reply = await callTextModel(ai, {
      system: SYSTEM,
      text: script,
      maxTokens: budgetFor(script),
    });
    return reconcileSpokenScript(script, reply);
  } catch (error) {
    console.warn("spoken-script rewrite failed; narrating as written", error);
    return script;
  }
}
