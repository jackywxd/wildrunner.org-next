import { expect, test } from "@playwright/test";

import { replyText } from "@/lib/ai/reply-text";

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
});
