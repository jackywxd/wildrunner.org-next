/**
 * The text out of a Workers AI reply, or nothing.
 *
 * Workers AI does not answer in one shape across its catalogue: some models
 * return `{ response }`, the chat-completions ones return
 * `{ choices: [{ message: { content } }] }`. The first version of the
 * improve endpoint read `response.response` and fell back to
 * `String(response)` for anything else — which, for a shape it did not
 * know, is the string "[object Object]". Non-empty, and therefore handed to
 * a member as their improved article underneath a button marked 接受.
 *
 * So this recognises the shapes and returns "" for everything else. Empty
 * is a 502 the member can act on; a wrong string is a document they cannot.
 *
 * Separate from the endpoint because that file cannot be imported without
 * dragging Payload and the Cloudflare context in, and this is the one piece
 * of it worth pinning down without a model on the other end.
 */
export function replyText(response: unknown): string {
  if (typeof response === "string") return response;
  if (!response || typeof response !== "object") return "";

  const direct = (response as { response?: unknown }).response;
  if (typeof direct === "string") return direct;

  const choice = (response as { choices?: { message?: { content?: unknown } }[] })
    .choices?.[0]?.message?.content;
  if (typeof choice === "string") return choice;

  return "";
}

/**
 * Why a reply had no text in it, as a short phrase for the member.
 *
 * `replyText` returning "" is the honest answer and a useless report. The
 * endpoint's message said 「AI 沒有回覆內容」 and stopped there, and finding
 * out what that meant took a staging deploy, three red CI runs and a walk
 * through Cloudflare's model docs — for a cause the reply itself was
 * carrying the whole time.
 *
 * The cause, and the reason this function exists rather than a comment:
 * Kimi K2.6 is a reasoning model, and its thinking is spent out of the same
 * `max_tokens` allowance as its answer. The summary endpoint allowed 400,
 * the model used all of it before writing a word, and what came back was a
 * well-formed chat completion with `finish_reason: "length"`, a long
 * `reasoning`, and `content: ""`. Every field needed to say that was in the
 * response object.
 *
 * Same shape as the qualifier importer's failure line in AGENTS.md: report
 * what the other side actually said, not a summary of it.
 */
export function describeEmptyReply(response: unknown): string {
  if (!response || typeof response !== "object") {
    return `回覆不是物件：${typeof response}`;
  }

  const choice = (
    response as {
      choices?: {
        finish_reason?: unknown;
        message?: { content?: unknown; reasoning?: unknown };
      }[];
    }
  ).choices?.[0];

  if (!choice) {
    // Not a chat completion at all. The keys are what a person needs to
    // recognise the shape and teach `replyText` about it.
    return `無法辨識的回覆形狀，鍵：${Object.keys(response).join(", ") || "（沒有）"}`;
  }

  const parts: string[] = [];
  if (choice.finish_reason !== undefined) {
    parts.push(`finish_reason=${String(choice.finish_reason)}`);
  }
  // Length, not the text: this ends up in a sentence on screen, and the
  // point is only whether the allowance went on thinking.
  const reasoning = choice.message?.reasoning;
  if (typeof reasoning === "string" && reasoning.length > 0) {
    parts.push(`推理 ${reasoning.length} 字`);
  }
  parts.push(`內文 ${typeof choice.message?.content === "string" ? choice.message.content.length : 0} 字`);
  return parts.join("，");
}
