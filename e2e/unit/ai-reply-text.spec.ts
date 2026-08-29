import { expect, test } from "@playwright/test";

import { describeEmptyReply, replyText } from "@/lib/ai/reply-text";

/**
 * U-AIREPLY — reading a Workers AI reply, or refusing to.
 *
 * The case that matters is the last one. Workers AI answers in more than
 * one shape, and the first version of the improve endpoint fell back to
 * `String(response)` for anything it did not recognise — which is
 * "[object Object]" for an object, a perfectly non-empty string, presented
 * to a member as their improved article underneath a button marked 接受.
 *
 * Cheap to assert and impossible to notice otherwise: nothing about the
 * screen says whether the text in the pane came from a model or from a
 * failed cast. This is the reason a model swap can be made without a model
 * on the other end.
 */

test.describe("U-AIREPLY reading a Workers AI reply", () => {
  test("U-AIREPLY-1: the two shapes Workers AI answers in", () => {
    // `{ response }` — llama, and most of the older catalogue.
    expect(replyText({ response: "潤飾後的文章" })).toBe("潤飾後的文章");
    // chat-completions — what the newer models return.
    expect(
      replyText({ choices: [{ message: { content: "潤飾後的文章" } }] }),
    ).toBe("潤飾後的文章");
    // And a bare string, which the binding's own types still allow.
    expect(replyText("潤飾後的文章")).toBe("潤飾後的文章");
  });

  test("U-AIREPLY-2: an unknown shape yields nothing rather than something", () => {
    // Each of these used to become a non-empty string. The endpoint checks
    // for empty and answers 502; anything else it hands to the member.
    expect(replyText({ output: "潤飾後的文章" })).toBe("");
    expect(replyText({ choices: [] })).toBe("");
    expect(replyText({ choices: [{ message: {} }] })).toBe("");
    expect(replyText({})).toBe("");
    expect(replyText(null)).toBe("");
    expect(replyText(undefined)).toBe("");
    expect(replyText(42)).toBe("");
  });

  test("U-AIREPLY-3: an empty reply is empty, not a space", () => {
    // The endpoint trims and treats blank as no answer at all, so this must
    // not smuggle whitespace through as content.
    expect(replyText({ response: "" })).toBe("");
    expect(replyText({ response: null })).toBe("");
  });

  test("U-AIREPLY-4: an empty reply says why it was empty", () => {
    // The staging failure this exists for, verbatim in shape: Kimi K2.6
    // spends its thinking out of the same `max_tokens` as its answer, so a
    // 400-token allowance came back as a well-formed completion with a long
    // `reasoning` and no `content`. The endpoint said 「AI 沒有回覆內容」 and
    // nothing else, and answering "why" took a deploy and three red runs.
    const outOfBudget = {
      choices: [
        {
          finish_reason: "length",
          message: { content: "", reasoning: "使用者要我寫摘要。".repeat(40) },
        },
      ],
    };
    expect(replyText(outOfBudget)).toBe("");

    const why = describeEmptyReply(outOfBudget);
    // The three facts that separate "spent the budget thinking" from every
    // other way to get nothing back. Each is asserted on its own: a single
    // substring match would pass on a message missing the other two.
    expect(why).toContain("finish_reason=length");
    expect(why).toContain("推理");
    expect(why).toContain("內文 0 字");
  });

  test("U-AIREPLY-5: a shape nobody taught it about reports its keys", () => {
    // The other way `replyText` returns "" — a reply that is not a chat
    // completion at all. Naming the keys is what makes the next model swap
    // a five-minute change rather than another round of guessing.
    const why = describeEmptyReply({ output_text: "摘要", meta: {} });
    expect(why).toContain("output_text");
    expect(why).toContain("meta");

    expect(describeEmptyReply(null)).toContain("回覆不是物件");
    expect(describeEmptyReply("")).toContain("回覆不是物件");
  });
});
