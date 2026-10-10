import Anthropic from "@anthropic-ai/sdk";
import type { Payload } from "payload";
import { APIError } from "payload";

import { claudeReplyText, describeEmptyClaudeReply } from "./claude-reply";
import { resolveAiProvider } from "./provider";
import { describeEmptyReply, replyText } from "./reply-text";

/**
 * One place that calls the model, for the endpoints that do — and the one
 * place that decides which backend that is: Workers AI or Claude, as the
 * admin set in the `ai-settings` global.
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
 * The Claude model, for every job.
 *
 * One model rather than one per job, by the admin's choice: Sonnet 5.5 for
 * improving, summarising, proofreading, expanding and the narration rewrite
 * alike. What differs between those jobs is how hard it thinks — `effort`,
 * passed per call — not which model does the thinking. A job that wants a
 * different model is a decision to make deliberately, here.
 */
const CLAUDE_MODEL = "claude-sonnet-5-5";

type Effort = "low" | "medium" | "high";

type TextModelRequest = {
  system: string;
  text: string;
  maxTokens: number;
  /**
   * Which Workers AI model, defaulting to the one above. Claude ignores it —
   * see `CLAUDE_MODEL`.
   *
   * Added for the narration rewrite, which is a different *kind* of job from
   * the two this file was written for. Improving and summarising an article
   * need judgement, and `MODEL` was chosen for it; rewriting `307` into
   * 三小時零七分 line for line needs none — and Kimi's reasoning makes it
   * pay for judgement anyway, measured at **106-178 seconds per ten lines**
   * against Mistral's 9. See `spoken-script.ts` for the comparison, which
   * includes the model that was faster still and got the one case that
   * matters wrong.
   */
  model?: string;
  /**
   * How hard Claude thinks. Workers AI has no equivalent and ignores it.
   *
   * `medium` by default: Sonnet 5.5's own default is `high`, which spends
   * more than rewriting a race report needs. A job that is mechanical — a
   * one-line summary, a line-for-line number rewrite — passes `low`.
   */
  effort?: Effort;
};

/**
 * What a call needs from its caller: the Workers AI binding, and Payload to
 * read which backend the admin chose.
 */
export type TextModelContext = { ai: Ai; payload: Payload };

/**
 * Ask the model the admin chose, and return its reply as text.
 *
 * The choice is read on every call rather than once per Worker, so switching
 * in /admin takes effect on the next button press. One D1 read against
 * seconds of inference.
 *
 * Throws an `APIError` — never returns something the caller has to check —
 * because every caller's answer to "no usable reply" is the same: tell the
 * member, write nothing.
 */
export async function callTextModel(
  { ai, payload }: TextModelContext,
  request: TextModelRequest,
): Promise<string> {
  const settings = await payload.findGlobal({ slug: "ai-settings", depth: 0 });
  if (resolveAiProvider(settings.provider) === "claude") {
    return callClaude(request);
  }
  return callWorkersAI(ai, request);
}

async function callClaude({
  system,
  text,
  maxTokens,
  effort = "medium",
}: TextModelRequest): Promise<string> {
  // Read here, per request, not at module scope: a module-level read is
  // evaluated during `next build` and baked into the bundle, while a Worker
  // secret only exists at runtime. wrangler.jsonc's `vars` comment records
  // the invite email that silently never sent for exactly this reason.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Loud, not a fallback to Workers AI. Falling back would make the switch
    // look like it worked while every request still went to the old backend.
    throw new APIError(
      "AI 設定選了 Claude，但這個環境沒有設定 ANTHROPIC_API_KEY。請管理員設定 secret 或改回 Workers AI。",
      503,
    );
  }

  try {
    const client = new Anthropic({ apiKey });
    const reply = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: text }],
      output_config: { effort },
      // A request the safety classifiers decline is re-run on a model chosen
      // by refusal category inside the same call, instead of reaching the
      // member as an empty reply. Race reports should never trip one; this
      // is what makes the rare false positive invisible.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    const answer = claudeReplyText(reply).trim();
    if (!answer) {
      throw new APIError(
        `AI 沒有回覆內容，請稍後再試。（${describeEmptyClaudeReply(reply)}）`,
        502,
      );
    }
    return answer;
  } catch (error) {
    if (error instanceof APIError) throw error;
    // Same reasoning as the Workers AI catch below: the reason goes on
    // screen. The SDK's own message carries the HTTP status (429 rate
    // limited, 529 overloaded, 401 a bad key), and those need different
    // fixes.
    console.warn("Claude call failed", error);
    throw new APIError(
      `AI 服務暫時不可用，請稍後再試。（Claude：${describe(error)}）`,
      502,
    );
  }
}

async function callWorkersAI(
  ai: Ai,
  { system, text, maxTokens, model = MODEL }: TextModelRequest,
): Promise<string> {
  try {
    const response = await ai.run(model, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: text },
      ],
      max_tokens: maxTokens,
    });

    const reply = replyText(response).trim();
    if (!reply) {
      // The reason travels with the message for the same reason it does in
      // the catch below — a Worker's log is not something the person hitting
      // the failure can read. This branch shipped without one and cost a
      // staging deploy and three red CI runs to answer a question the reply
      // object could have answered on screen. See describeEmptyReply.
      throw new APIError(
        `AI 沒有回覆內容，請稍後再試。（${describeEmptyReply(response)}）`,
        502,
      );
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
