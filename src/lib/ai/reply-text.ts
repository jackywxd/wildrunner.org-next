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
