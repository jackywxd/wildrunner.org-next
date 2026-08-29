import type { Endpoint } from "payload";
import { APIError } from "payload";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { callTextModel, realAIAvailable } from "@/lib/ai/call-model";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";

/**
 * Write the 摘要 for an article the member has already written.
 *
 * `description` is required on every post and it is the field members are
 * most likely to leave until last: it is not the article, nobody reads it
 * while writing, and it is the one thing standing between a finished draft
 * and publishing. It is also the most *public* field — the posts index, the
 * page's meta description, and whatever a link preview shows when the
 * article is shared.
 *
 * So this asks for two sentences, not a rewrite, and what comes back is a
 * suggestion the member accepts or ignores. The panel never writes over a
 * description they wrote themselves.
 *
 * What arrives here is prose only — `proseOnly` in
 * `src/lib/editor/ai-markers.ts` drops the images and tables rather than
 * marking them, since a `[[BLOCK-0]]` echoed into a summary would be printed
 * on the public site.
 */

/**
 * The whole article goes in; two sentences come out.
 *
 * The input cap is the improve endpoint's, for the same reason — it is about
 * how long a member will wait, not about the model, whose context window is
 * 262k. The output allowance is small on purpose: it is the ceiling that
 * makes "two sentences" cost a fraction of what improving the same article
 * costs, and a model that ignores the instruction is cut off rather than
 * producing an essay in a textarea two rows tall.
 */
const MAX_INPUT_CHARS = 12_000;
const MAX_OUTPUT_TOKENS = 400;

const SYSTEM = [
  "你是一位越野跑與馬拉松專欄編輯。使用者會給你一篇文章，請寫出它的摘要。",
  "規則：",
  "1. 一到兩句話，不超過一百字。",
  "2. 只根據文章寫得出來的內容，不要新增作者沒有寫過的事實、數字或評價。",
  "3. 不要翻譯。作者用哪一種語言寫，就用哪一種語言寫摘要；原文是中文時使用繁體中文，不要簡體。",
  "4. 直接寫摘要本身，不要加上「摘要：」這種前綴，也不要加任何說明或結語。",
  "5. 不要使用 Markdown 記號、引號或條列。這段文字會直接放進一個欄位，並顯示在文章列表和分享預覽上。",
].join("\n");

type SummariseBody = { text?: string };

export const aiSummarisePostEndpoint: Endpoint = {
  path: "/ai/summarise-post",
  method: "post",
  handler: async (req) => {
    if (!req.user) {
      throw new APIError("Unauthorized", 401);
    }

    const { env } = await getCloudflareContext({ async: true });
    // Before the body is parsed, and the same budget the other AI endpoints
    // spend. See src/lib/ai/rate-limit.ts.
    await checkAiRateLimit(env.D1, String(req.user.id));

    let body: SummariseBody;
    try {
      body = (await req.json?.()) as SummariseBody;
    } catch {
      throw new APIError("Invalid JSON body", 400);
    }

    const text = (body.text ?? "").trim();
    if (!text) {
      throw new APIError("文章還沒有內容可以摘要。", 400);
    }
    if (text.length > MAX_INPUT_CHARS) {
      throw new APIError(
        `文章太長了（${text.length} 字），目前一次最多摘要 ${MAX_INPUT_CHARS} 字。`,
        400,
      );
    }

    if (!realAIAvailable()) {
      // A stand-in for the environments with no Workers AI binding: CI's
      // local suite and `pnpm dev` without AI_IN_DEV. It obeys the rule that
      // matters — a short line drawn only from the article's own words — so
      // the flow around it works and can be walked by hand.
      //
      // No test asserts on this wording. One did on the improve endpoint's
      // stand-in and went red on the staging deploy, where the real model
      // runs, having proved nothing about what ships.
      return Response.json({ text: stubSummary(text), stub: true });
    }

    const summary = await callTextModel(env.AI, {
      system: SYSTEM,
      text,
      maxTokens: MAX_OUTPUT_TOKENS,
    });
    // Flattened, because the field is a textarea whose value is printed as a
    // meta description: a summary that arrives as several lines would carry
    // its line breaks into a link preview.
    return Response.json({ text: summary.replace(/\s*\n+\s*/g, " ").trim() });
  },
};

/** The article's opening, cut to a sentence — its own words, and no more. */
function stubSummary(text: string): string {
  const flat = text.replace(/\s*\n+\s*/g, " ").trim();
  const head = flat.slice(0, 60);
  return `${head}${flat.length > 60 ? "…" : ""}（AI 摘要）`;
}
