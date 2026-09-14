import type { Endpoint } from "payload";
import { APIError } from "payload";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { callTextModel, realAIAvailable } from "@/lib/ai/call-model";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";

/**
 * Find the 錯別字 in an article the member has written, and say where.
 *
 * Separate from `/ai/improve-post` rather than a mode of it, because the two
 * promise opposite things. Improve is allowed to rewrite every sentence and
 * the member's answer to it is one yes or no; this one may not change a
 * single character the member did not misspell, and its answer is five
 * separate yeses and noes. A prompt cannot hold both — a model told it may
 * rewrite will rewrite — and neither can the screen.
 *
 * So this endpoint returns no article. It is given numbered lines and
 * replies with `行號|錯|正`, which the caller checks against the document
 * before anybody sees it (`src/lib/editor/typos.ts`). The endpoint knows
 * nothing about Lexical and cannot damage a document: the worst a bad reply
 * can do here is offer a correction that gets dropped for not matching.
 */

/**
 * How much article the endpoint accepts, and how much reply it allows.
 *
 * The input cap matches improve-post — it is the same article, with line
 * numbers on it.
 *
 * **The output allowance is not about the size of the reply**, and sizing it
 * that way is what broke this endpoint in production. It shipped at 2,000 on
 * the reasoning that a list of short fragments needs nothing like that much,
 * which is true and irrelevant: Kimi K2.6 is a reasoning model and spends its
 * thinking out of this same allowance. A member pressed 改錯字 on a real race
 * report and got 「AI 沒有回覆內容」 with `finish_reason=length，內文 0 字` —
 * the whole 2,000 gone before it wrote a character.
 *
 * `reply-text.ts` already carried this incident, from the summary endpoint
 * shipping at 400 and failing the same way. Reading `call-model.ts` and not
 * that file is how the same mistake was made twice with a different constant.
 *
 * So: the same 16,000 improve-post allows. The two read the same 12,000
 * characters and think about them for the same reason; improve then spends
 * most of its allowance writing the article back, and this spends almost none
 * of it, so every token improve uses for prose is thinking room here. A
 * number chosen from the length of the answer would be wrong again.
 */
const MAX_INPUT_CHARS = 12_000;
const MAX_OUTPUT_TOKENS = 16_000;

/**
 * What the model is told.
 *
 * Rule 1 is the whole feature and it is the rule a writing model most wants
 * to break: asked to proofread, it also tidies. That is what 完善 is for,
 * and a tidy arriving under a button marked 改錯字 is a change the member
 * approved without being shown.
 *
 * Rule 4 is what makes a reply usable at all. A fragment that occurs twice
 * in its line cannot be placed — `parseCorrections` drops it rather than
 * guess — so asking for a long enough one is asking for the correction to
 * survive the trip.
 */
const SYSTEM = [
  "你是一位繁體中文校對。使用者會給你一篇文章，每一行前面都有行號，例如「3: 」。",
  "規則：",
  "1. 只找錯別字：同音或形近而用錯的字，例如「己經」應為「已經」、「因該」應為「應該」。不要潤飾文句、不要改寫、不要調整標點、不要增刪內容。",
  "2. 不要翻譯，也不要把繁體改成簡體。不是中文的行直接略過。",
  "3. 每找到一個錯別字就輸出一行，格式是「行號|錯的詞|正確的詞」，例如：3|己經|已經",
  "4. 「錯的詞」必須是那一行裡原封不動出現的片段，而且要夠長，長到在那一行裡只出現一次。「正確的詞」只改錯的那幾個字，不要換句話說。",
  "5. 沒有把握就不要報。寧可漏掉，也不要把作者寫對的字改掉。",
  "6. 沒有發現任何錯別字時，只輸出「無」。",
  "7. 除了這些行以外，不要輸出任何說明、前言或結語。",
].join("\n");

type FixTyposBody = { text?: string };

export const aiFixTyposEndpoint: Endpoint = {
  path: "/ai/fix-typos",
  method: "post",
  handler: async (req) => {
    if (!req.user) {
      throw new APIError("Unauthorized", 401);
    }

    const { env } = await getCloudflareContext({ async: true });
    // Before the body is parsed, and the same budget the other AI endpoints
    // spend. See src/lib/ai/rate-limit.ts.
    await checkAiRateLimit(env.D1, String(req.user.id));

    let body: FixTyposBody;
    try {
      body = (await req.json?.()) as FixTyposBody;
    } catch {
      throw new APIError("Invalid JSON body", 400);
    }

    const text = (body.text ?? "").trim();
    if (!text) {
      throw new APIError("文章還沒有內容可以檢查。", 400);
    }
    if (text.length > MAX_INPUT_CHARS) {
      throw new APIError(
        `文章太長了（${text.length} 字），目前一次最多檢查 ${MAX_INPUT_CHARS} 字。`,
        400,
      );
    }

    if (!realAIAvailable()) {
      return Response.json({ text: stubFixTypos(text), stub: true });
    }

    const reply = await callTextModel(env.AI, {
      system: SYSTEM,
      text,
      maxTokens: MAX_OUTPUT_TOKENS,
    });
    return Response.json({ text: reply });
  },
};

/**
 * Typos a dictionary can be sure of.
 *
 * Every pair here is wrong in every context, which is what lets a stand-in
 * report it without reading the sentence. The ones that make this feature
 * worth having — 的/得/地, 在/再, 做/作 — are exactly the ones that cannot
 * go in a list like this, and that is the line between the stand-in and the
 * model rather than a shortcoming of the list.
 */
const STUB_TYPOS: [string, string][] = [
  ["己經", "已經"],
  ["因該", "應該"],
  ["迫不急待", "迫不及待"],
  ["一昧", "一味"],
  ["按耐不住", "按捺不住"],
];

/**
 * A stand-in for the model where there is no Workers AI binding: CI's local
 * suite, and `pnpm dev` without AI_IN_DEV.
 *
 * It is not a mock. It obeys the contract the prompt sets — the reply shape,
 * and rule 4's "only once in that line", which it checks for itself rather
 * than trusting — so what comes back survives `parseCorrections` for the
 * same reasons the model's reply does, and the whole flow can be walked by
 * hand. No test asserts on which pairs are in it; M-AITYPO asserts only
 * properties that hold whatever comes back, because against staging this
 * runs the real model.
 */
function stubFixTypos(text: string): string {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const match = /^\s*(\d+):\s?(.*)$/.exec(raw);
    if (!match) continue;
    const [, number, line] = match;
    for (const [wrong, right] of STUB_TYPOS) {
      if (line.split(wrong).length - 1 === 1) out.push(`${number}|${wrong}|${right}`);
    }
  }
  return out.join("\n") || "無";
}
