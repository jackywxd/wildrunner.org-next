import type Anthropic from "@anthropic-ai/sdk";

/**
 * The text out of a Claude reply, or nothing — the Claude half of what
 * `reply-text.ts` does for Workers AI, and pure for the same reason.
 */

type ClaudeReply = Pick<
  Anthropic.Beta.BetaMessage,
  "content" | "stop_reason" | "stop_details"
>;

/**
 * The answer, only when the model finished it.
 *
 * STRICTER THAN THE WORKERS AI SIDE, ON PURPOSE. A reply that stopped on
 * `max_tokens` or `refusal` can still carry text — the first part of an
 * article, cut off mid-sentence — and that text is non-empty, so an endpoint
 * checking for "" would hand it to a member as their improved article under
 * a button marked 接受. Accepting it would silently delete the rest of what
 * they wrote. Claude says outright whether it finished, so this only takes
 * the text when it did.
 *
 * Joins every `text` block. Thinking blocks are the model's reasoning and a
 * `fallback` block marks where another model took over; neither is answer.
 */
export function claudeReplyText(reply: ClaudeReply): string {
  if (reply.stop_reason !== "end_turn" && reply.stop_reason !== "stop_sequence") {
    return "";
  }
  return reply.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
}

/**
 * Why `claudeReplyText` returned nothing, as a short phrase for the member.
 *
 * Same purpose as `describeEmptyReply`: the reason travels in the message,
 * because a Worker's log is not something the person who hit it can read.
 * The case to expect is `max_tokens`, which is the incident `reply-text.ts`
 * records for Kimi — thinking is paid out of the same allowance as the
 * answer, on Claude as much as on Kimi.
 */
export function describeEmptyClaudeReply(reply: ClaudeReply): string {
  const parts = [`stop_reason=${reply.stop_reason ?? "null"}`];
  if (reply.stop_reason === "refusal" && reply.stop_details?.category) {
    parts.push(`category=${reply.stop_details.category}`);
  }
  const textLength = reply.content.reduce(
    (sum, block) => sum + (block.type === "text" ? block.text.length : 0),
    0,
  );
  parts.push(`內文 ${textLength} 字`);
  return parts.join("，");
}
