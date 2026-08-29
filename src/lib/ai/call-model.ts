import { APIError } from "payload";

import { replyText } from "./reply-text";

/**
 * One place that calls the model, for the endpoints that do.
 *
 * `/ai/improve-post` and `/ai/summarise-post` differ in exactly two things:
 * what they tell the model, and how much reply they allow. Everything around
 * that — which model, whether there is a binding to call at all, how to read
 * a reply whose shape varies by model, what to do when the call throws — was
 * the same in both, and a second copy of it is a second place to fix.
 */

/**
 * The model.
 *
 * `@cf/meta/llama-3.3-70b-instruct-fp8-fast` was the first choice and it was
 * the wrong shape for this work. The hard part is not writing — it is doing
 * exactly as told: emit `[[BLOCK-3]]` back byte for byte, add no preamble.
 * That is where a mid-size open model gives way first, and it gives way
 * helpfully: it wants to turn the marker into 「（此處有一張圖片）」, which
 * reads like a considerate answer and destroys a photograph.
 *
 * Kimi K2.6 is a 1T-parameter model (32B active) with a 262k context window,
 * and Chinese is not an afterthought in it. Cloudflare-hosted, so this stays
 * on the `AI` binding wrangler.jsonc already declares — no gateway, no
 * provider credentials, nothing new to keep secret.
 *
 * It needs the Workers Paid plan (or prepaid AI Gateway credits); the free
 * tier does not serve it. Its rate limit is also far lower than ordinary
 * text generation — 20 requests per minute per account, 50 with prepaid
 * credits — because it is a frontier model. If calls start failing in
 * bursts, that is the first thing to check.
 */
const MODEL = "@cf/moonshotai/kimi-k2.6";

/**
 * Whether there is a real model to call.
 *
 * False in CI's local suite and in `pnpm dev` without AI_IN_DEV, where each
 * endpoint answers with its own stand-in instead. A stand-in is not a mock
 * of the model: it obeys the one rule the model is given, so the flow around
 * it works and can be walked by hand.
 */
// Not named `useRealAI`: ESLint's rules-of-hooks reads a `use` prefix as a
// React hook and refuses to see it called from a request handler.
export function realAIAvailable(): boolean {
  return (
    process.env.NEXTJS_ENV !== "test" &&
    (process.env.NODE_ENV === "production" || process.env.AI_IN_DEV === "true")
  );
}

/**
 * Ask the model, and return its reply as text.
 *
 * Throws an `APIError` — never returns something the caller has to check —
 * because every caller's answer to "no usable reply" is the same: tell the
 * member, write nothing.
 */
export async function callTextModel(
  ai: Ai,
  { system, text, maxTokens }: { system: string; text: string; maxTokens: number },
): Promise<string> {
  try {
    const response = await ai.run(MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: text },
      ],
      max_tokens: maxTokens,
    });

    const reply = replyText(response).trim();
    if (!reply) {
      throw new APIError("AI 沒有回覆內容，請稍後再試。", 502);
    }
    return reply;
  } catch (error) {
    if (error instanceof APIError) throw error;
    // The reason travels with the message rather than only into
    // console.warn. A Worker's log is not something the person hitting the
    // failure can read — reporting one costs a round of "which message did
    // you see" and often a deploy — and this call fails for reasons needing
    // different fixes, which Workers AI distinguishes by code: 3006 request
    // too large, 3007 timeout, 3040 out of capacity, 429 rate limited. Same
    // reasoning as the qualifier importer's failure line in AGENTS.md, which
    // walks the cause chain so the next failure says what the database
    // actually objected to.
    console.warn("Workers AI call failed", error);
    throw new APIError(
      `AI 服務暫時不可用，請稍後再試。（${describe(error)}）`,
      502,
    );
  }
}

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
    const message = current instanceof Error ? current.message : String(current);
    if (message && !parts.includes(message)) parts.push(message);
    current = current instanceof Error ? current.cause : undefined;
  }
  const joined = parts.join(" ← ") || "沒有錯誤訊息";
  return joined.length > 200 ? `${joined.slice(0, 200)}…` : joined;
}
