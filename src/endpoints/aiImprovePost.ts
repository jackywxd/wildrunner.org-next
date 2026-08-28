import type { Endpoint } from "payload";
import { APIError } from "payload";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { replyText } from "@/lib/ai/reply-text";

/**
 * Improve an article the member has already written, in place.
 *
 * Separate from `/ai/expand-post` rather than a mode of it, because the two
 * do opposite things: expand turns a few notes into a draft and *replaces*
 * the document, improve rewrites a finished document and has to give it back
 * recognisable. They differ in prompt, in what they promise about the input,
 * and in what they return — this one hands back plain text, because the
 * caller has to reassemble it around the nodes it held back
 * (`src/lib/editor/ai-markers.ts`) and only the caller has those.
 *
 * The endpoint therefore knows nothing about Lexical. What it receives is
 * text with `[[BLOCK-n]]` lines in it, and its whole contract is: improve
 * the prose, leave those lines alone.
 */

/**
 * The model.
 *
 * `@cf/meta/llama-3.3-70b-instruct-fp8-fast` was the first choice and it was
 * the wrong shape for this job. The hard part here is not writing — it is
 * doing exactly as told: emit `[[BLOCK-3]]` back byte for byte, on its own
 * line, and add no preamble. That is where a mid-size open model gives way
 * first, and helpfully: it wants to translate the marker into 「（此處有一
 * 張圖片）」, which reads like a considerate answer and destroys a
 * photograph.
 *
 * Kimi K2.6 is a 1T-parameter model (32B active) with a 262k context
 * window, and Chinese is not an afterthought in it. Cloudflare-hosted, so
 * this stays on the `AI` binding wrangler.jsonc already declares — no
 * gateway, no provider credentials, nothing new to keep secret.
 *
 * It needs the Workers Paid plan (or prepaid AI Gateway credits); the free
 * tier does not serve it. If the binding starts answering 4xx after a plan
 * change, that is the first thing to check.
 */
const MODEL = "@cf/moonshotai/kimi-k2.6";

/**
 * How much article the endpoint accepts, and how much reply it allows.
 *
 * These two are one decision, not two. The cap exists so that a member is
 * never handed three quarters of their article with the ending missing, in
 * a pane inviting them to press 接受 — so the output allowance has to
 * comfortably exceed anything the input can turn into. A rewrite is about
 * as long as what it rewrites, and Traditional Chinese runs somewhere near
 * one token per character, so the allowance is set well above the cap
 * rather than level with it.
 *
 * The old pair (8k in, 4k out) was measured against the 70B model's
 * truncation point. Neither number means anything now: this model's context
 * window is 262k, and the limit is the member's patience, not the model's.
 */
const MAX_INPUT_CHARS = 12_000;
const MAX_OUTPUT_TOKENS = 16_000;

/**
 * What the model is told.
 *
 * Rule 2 replaces 「使用繁體中文」, which was read as an instruction to
 * translate. A member pasted an English race sheet and got back a Traditional
 * Chinese one — a faithful, well-written translation of an article they had
 * not asked to have translated, sitting under a button marked 接受. The
 * intent was only ever "if it is Chinese, write it in Traditional, not
 * Simplified", and the rule now says that and nothing more.
 *
 * Rule 3 is the same lesson one step down. The same reply turned a run-on
 * paragraph of race statistics into a tidy list — plausibly better, and
 * still not what 潤飾 means. A member who wanted their article restructured
 * would have restructured it.
 */
const SYSTEM = [
  "你是一位越野跑與馬拉松專欄編輯。使用者會給你一篇已經寫好的文章，請潤飾它的文字。",
  "規則：",
  "1. 保留作者的原意、事實與語氣，不要新增作者沒有寫過的事實或數字。",
  "2. 不要翻譯。作者用哪一種語言寫，就用哪一種語言回覆；原文是英文就保持英文。原文是中文時一律使用繁體中文，不要改成簡體。",
  "3. 保留作者的結構：段落怎麼分就怎麼分，不要把段落改寫成清單、不要新增或刪除標題、不要重新編排順序。你潤飾的是句子。",
  "4. 保留 Markdown 記號：# 標題、> 引用、- 清單，作者原本有的就留著。",
  "5. 凡是形如 [[BLOCK-0]]、[[BLOCK-1]] 的行，必須原封不動輸出，單獨成行，不可翻譯、改寫、刪除或移動。它們代表文章裡的圖片與表格。",
  "6. 只輸出文章本身，不要加上任何說明、前言或結語。",
].join("\n");

type ImproveBody = { text?: string };

export const aiImprovePostEndpoint: Endpoint = {
  path: "/ai/improve-post",
  method: "post",
  handler: async (req) => {
    if (!req.user) {
      throw new APIError("Unauthorized", 401);
    }

    const { env } = await getCloudflareContext({ async: true });
    // Before the body is parsed, and the same budget /ai/expand-post spends.
    // See src/lib/ai/rate-limit.ts.
    await checkAiRateLimit(env.D1, String(req.user.id));

    let body: ImproveBody;
    try {
      body = (await req.json?.()) as ImproveBody;
    } catch {
      throw new APIError("Invalid JSON body", 400);
    }

    const text = (body.text ?? "").trim();
    if (!text) {
      throw new APIError("文章還沒有內容可以完善。", 400);
    }
    if (text.length > MAX_INPUT_CHARS) {
      throw new APIError(
        `文章太長了（${text.length} 字），目前一次最多完善 ${MAX_INPUT_CHARS} 字。`,
        400,
      );
    }

    const useAI =
      process.env.NEXTJS_ENV !== "test" &&
      (process.env.NODE_ENV === "production" || process.env.AI_IN_DEV === "true");

    if (!useAI) {
      // Not a mock of the model — a stand-in for it that obeys the one rule
      // the model is given, so the whole flow works where there is no
      // Workers AI binding: CI's local suite, and `pnpm dev` without
      // AI_IN_DEV. Marker lines through untouched, every other line visibly
      // changed, so a person opening the panel in dev can see at a glance
      // that a different document came back.
      //
      // No test asserts on 「（已潤飾）」. One did, and went red on the
      // staging deploy — where the real model runs — having proved nothing
      // about what ships. M-AIIMPROVE asserts only properties that hold
      // whatever comes back.
      return Response.json({ text: stubImprove(text), stub: true });
    }

    try {
      const response = await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: text },
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
      });
      const improved = replyText(response).trim();

      if (!improved) {
        throw new APIError("AI 沒有回覆內容，請稍後再試。", 502);
      }
      return Response.json({ text: improved.trim() });
    } catch (error) {
      if (error instanceof APIError) throw error;
      // Unlike expand-post, there is no useful fallback: handing back the
      // member's own text as "the improved version" would put an unchanged
      // document in the accept pane and invite them to approve a change that
      // never happened.
      //
      // The reason travels with the message rather than only into
      // console.warn. A Worker's log is not something the person hitting the
      // failure can read — reporting one costs a round of "which message did
      // you see" and often a deploy — and a model call can fail for reasons
      // that need different fixes: a token limit, a plan that does not serve
      // the model, a timeout on a long article. Same reasoning as the
      // qualifier importer's failure line in AGENTS.md, which walks the cause
      // chain so the next failure says what the database actually objected to.
      console.warn("Workers AI improve failed", error);
      throw new APIError(
        `AI 服務暫時不可用，請稍後再試。（${describe(error)}）`,
        502,
      );
    }
  },
};

/**
 * A short, reportable description of a thrown value.
 *
 * Walks `cause`, because the outermost message is often a wrapper — the
 * shape AGENTS.md records for Drizzle, where `.message` is its own summary
 * and the real complaint sits one or two levels down. Truncated, because
 * this ends up in a sentence on screen and nobody needs the stack.
 */
function describe(error: unknown): string {
  const parts: string[] = [];
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const message =
      current instanceof Error ? current.message : String(current);
    if (message && !parts.includes(message)) parts.push(message);
    current = current instanceof Error ? current.cause : undefined;
  }
  const joined = parts.join(" ← ") || "沒有錯誤訊息";
  return joined.length > 200 ? `${joined.slice(0, 200)}…` : joined;
}

/** Marker lines verbatim; everything else marked as having been through. */
function stubImprove(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || /^\[\[BLOCK-\d+\]\]$/.test(trimmed)) return line;
      return `${line}（已潤飾）`;
    })
    .join("\n");
}
