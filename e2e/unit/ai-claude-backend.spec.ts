import { expect, test } from "@playwright/test";

import { claudeReplyText, describeEmptyClaudeReply } from "@/lib/ai/claude-reply";
import { resolveAiProvider } from "@/lib/ai/provider";

/**
 * U-AICLAUDE — reading a Claude reply, and reading which backend was chosen.
 *
 * Both halves are ours and neither is visible from a screen until it has
 * already gone wrong for a member. No model is called: CI has no key, and
 * what is pinned here is what we do with whatever comes back.
 */

type Reply = Parameters<typeof claudeReplyText>[0];

/** Only the fields the reader looks at; the SDK's blocks carry more. */
function reply(
  stop_reason: string,
  content: { type: string; text?: string }[],
  category?: string,
): Reply {
  return {
    stop_reason,
    content,
    stop_details: category ? { type: "refusal", category, explanation: null } : null,
  } as unknown as Reply;
}

test.describe("U-AICLAUDE reading a Claude reply", () => {
  test("U-AICLAUDE-1: a finished reply is its text blocks and nothing else", () => {
    // Thinking is the model's working and a fallback block marks where
    // another model took over. Neither belongs in a member's article.
    const finished = reply("end_turn", [
      { type: "thinking", text: "先想一想" },
      { type: "text", text: "潤飾後的" },
      { type: "fallback" },
      { type: "text", text: "文章" },
    ]);
    expect(claudeReplyText(finished)).toBe("潤飾後的文章");
  });

  test("U-AICLAUDE-2: a reply cut off mid-article yields nothing, though it has text", () => {
    // The failure this guards: the first half of an article, non-empty, so
    // the endpoint's empty check passes and the member is offered it under
    // 接受 — accepting it deletes everything after the cut.
    const cut = reply("max_tokens", [{ type: "text", text: "文章的前半段" }]);
    expect(claudeReplyText(cut)).toBe("");
    // And the member is told why, in terms they can pass on.
    expect(describeEmptyClaudeReply(cut)).toBe("stop_reason=max_tokens，內文 6 字");
  });

  test("U-AICLAUDE-3: a refusal yields nothing, and names its category", () => {
    const refused = reply("refusal", [{ type: "text", text: "部分" }], "cyber");
    expect(claudeReplyText(refused)).toBe("");
    expect(describeEmptyClaudeReply(refused)).toBe(
      "stop_reason=refusal，category=cyber，內文 2 字",
    );
  });
});

test.describe("U-AIPROVIDER reading the admin's choice", () => {
  test("U-AIPROVIDER-1: an unsaved or unknown setting means Workers AI", () => {
    // The failure this guards: the migration creates the table and no row.
    // If "nothing stored" meant anything but Workers AI, deploying would
    // switch production to a backend nobody had chosen — and, with no key
    // set, fail every AI button on the site.
    expect(resolveAiProvider(undefined)).toBe("workers-ai");
    expect(resolveAiProvider(null)).toBe("workers-ai");
    // A value from a later version of the list, after a rollback.
    expect(resolveAiProvider("openai")).toBe("workers-ai");
  });

  test("U-AIPROVIDER-2: each stored choice is honoured", () => {
    expect(resolveAiProvider("claude")).toBe("claude");
    expect(resolveAiProvider("workers-ai")).toBe("workers-ai");
  });
});
