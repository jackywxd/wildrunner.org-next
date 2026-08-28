import type { Endpoint } from "payload";
import { APIError } from "payload";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { checkAiRateLimit } from "@/lib/ai/rate-limit";

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
 * Roughly the point where the 70B model's reply starts getting truncated
 * rather than finished, at `max_tokens` below. Refused rather than silently
 * cut: a member handed back three quarters of their article with the ending
 * missing, in a pane inviting them to press 接受, is the worst outcome this
 * feature can produce.
 */
const MAX_INPUT_CHARS = 8_000;

const SYSTEM = [
  "你是一位中文越野跑與馬拉松專欄編輯。使用者會給你一篇已經寫好的文章，請潤飾它。",
  "規則：",
  "1. 保留作者的原意、事實與語氣，不要新增作者沒有寫過的事實或數字。",
  "2. 使用繁體中文。",
  "3. 保留 Markdown 結構：# 標題、> 引用、- 清單。",
  "4. 凡是形如 [[BLOCK-0]]、[[BLOCK-1]] 的行，必須原封不動輸出，單獨成行，不可翻譯、改寫、刪除或改變順序以外的任何部分。它們代表文章裡的圖片與表格。",
  "5. 只輸出文章本身，不要加上任何說明、前言或結語。",
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
      const response = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: text },
        ],
        max_tokens: 4_000,
      });
      const improved =
        typeof response === "object" && response && "response" in response
          ? String((response as { response?: string }).response ?? "")
          : String(response);

      if (!improved.trim()) {
        throw new APIError("AI 沒有回覆內容，請稍後再試。", 502);
      }
      return Response.json({ text: improved.trim() });
    } catch (error) {
      if (error instanceof APIError) throw error;
      // Unlike expand-post, there is no useful fallback: handing back the
      // member's own text as "the improved version" would put an unchanged
      // document in the accept pane and invite them to approve a change that
      // never happened.
      console.warn("Workers AI improve failed", error);
      throw new APIError("AI 服務暫時不可用，請稍後再試。", 502);
    }
  },
};

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
