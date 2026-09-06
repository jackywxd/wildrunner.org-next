import { expect, test } from "@playwright/test";

import { reconcileSpokenScript } from "@/lib/ai/spoken-script";

/**
 * U-SCRIPT — what is allowed back from the model that rewrites an article for
 * the voice.
 *
 * THE WHOLE SAFETY ARGUMENT OF THAT STEP IS THIS FUNCTION, which is why it is
 * separable and asserted here rather than left inside the call. A model asked
 * to rewrite an article will sometimes improve it — summarise a paragraph,
 * merge two, add a heading, open with 「好的，以下是…」 — and every one of
 * those is silent: the audio would simply be of a shorter article, read
 * fluently, and nothing on screen would differ.
 *
 * The line count is the invariant because the script is one line per sentence
 * and every one of those failures changes it. What it deliberately does NOT
 * try to catch is a line rewritten into something unrelated while the count
 * holds — no threshold separates that from the legitimate expansion this exists
 * for (`307` → `三小時零七分` is a 200% length change on that line).
 */
test.describe("U-SCRIPT the rewrite a voice is allowed to be given", () => {
  const original = ["柏林跑了307", "保持415左右的配速", "完賽時間是3:36"].join("\n");

  test("U-SCRIPT-1: a line-for-line rewrite is taken", () => {
    const reply = [
      "柏林跑了三小時零七分",
      "保持每公里四分十五秒左右的配速",
      "完賽時間是三小時三十六分",
    ].join("\n");
    expect(reconcileSpokenScript(original, reply)).toBe(reply);
  });

  test("U-SCRIPT-2: a reply that lost a line is refused", () => {
    // The failure this exists for. A summarising model returns fluent, correct
    // Chinese — just less of it — and the only evidence is the count.
    const reply = ["柏林跑了三小時零七分", "完賽時間是三小時三十六分"].join("\n");
    expect(reconcileSpokenScript(original, reply)).toBe(original);
  });

  test("U-SCRIPT-3: a reply that gained a line is refused", () => {
    // Merging is not the only shape: a preamble adds one at the top, and a
    // model that splits a long sentence adds one in the middle.
    const withPreamble = ["好的，以下是改寫後的內容：", original].join("\n");
    expect(reconcileSpokenScript(original, withPreamble)).toBe(original);
  });

  test("U-SCRIPT-7: a correct rewrite that came back double-spaced is taken", () => {
    // MEASURED, and the reason blank lines are stripped before the count is
    // taken. Mistral returns a right answer with a blank line between every
    // line about as often as not: ten lines arrive as nineteen. The first
    // version of the reconciler refused two chunks in five of the Chicago
    // article that way — including the one holding the 415 pace — and the
    // reply had been correct every time.
    const doubled = [
      "柏林跑了三小時零七分",
      "",
      "保持每公里四分十五秒左右的配速",
      "",
      "完賽時間是三小時三十六分",
    ].join("\n");
    expect(reconcileSpokenScript(original, doubled)).toBe(
      ["柏林跑了三小時零七分", "保持每公里四分十五秒左右的配速", "完賽時間是三小時三十六分"].join("\n"),
    );
  });

  test("U-SCRIPT-4: an empty reply, or a lost line, is refused", () => {
    expect(reconcileSpokenScript(original, "")).toBe(original);
    expect(reconcileSpokenScript(original, "   ")).toBe(original);
    // A blank standing in for a line the model dropped. Stripping blanks
    // first is what stops that disguising itself as the right count: three
    // lines in, two of substance out, refused.
    expect(
      reconcileSpokenScript(original, ["柏林跑了三小時零七分", "", "完賽時間是三小時三十六分"].join("\n")),
    ).toBe(original);
  });

  test("U-SCRIPT-5: surrounding whitespace does not fail an otherwise good reply", () => {
    // A model that ends with a newline has not done anything wrong, and
    // refusing it would mean falling back on most replies for no reason.
    const reply = ["柏林跑了三小時零七分", "保持每公里四分十五秒左右的配速", "完賽時間是三小時三十六分"].join("\n");
    expect(reconcileSpokenScript(original, `${reply}\n`)).toBe(reply);
  });

  test("U-SCRIPT-6: a single-line script is handled like any other", () => {
    // The control for the split/join arithmetic: an article can be one
    // sentence, and `"".split("\n")` has length 1, not 0.
    expect(reconcileSpokenScript("跑了307", "跑了三小時零七分")).toBe("跑了三小時零七分");
    expect(reconcileSpokenScript("跑了307", "跑了三小時零七分\n多一行")).toBe("跑了307");
  });
});
