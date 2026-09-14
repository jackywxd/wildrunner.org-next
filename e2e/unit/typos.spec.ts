import { expect, test } from "@playwright/test";

import {
  applyCorrection,
  parseCorrections,
  toTypoText,
} from "@/lib/editor/typos";
import type { JsonNode, PayloadContent } from "@/lib/editor/serialize";

/**
 * U-TYPO — the AI proofreader changes the character it was accepted for,
 * and nothing else.
 *
 * Everything below is about what happens when the model is *wrong*, because
 * that is the whole risk of the feature. A model that reports a typo that
 * is not there, or names a fragment that sits in two places, or hands back
 * a rewritten sentence dressed as a correction, must not be able to reach
 * the member's article — and none of those failures is visible on screen:
 * a card offering 「己經 → 已經」 looks identical whether the word behind it
 * is the one that will be changed or not.
 *
 * So the assertions are about the document, not the list: what the reply
 * was allowed to touch, and that everything it was not allowed to touch is
 * byte-identical afterwards.
 */

const text = (value: string, format = 0): JsonNode => ({
  type: "text",
  text: value,
  format,
  style: "",
  mode: "normal",
  detail: 0,
  version: 1,
});

const block = (type: string, children: JsonNode[], extra: object = {}): JsonNode => ({
  type,
  format: "",
  indent: 0,
  version: 1,
  direction: "ltr",
  children,
  ...extra,
});

const image = (id: number): JsonNode => ({
  type: "upload",
  relationTo: "media",
  value: id,
  version: 3,
  format: "",
  fields: null,
});

const document = (children: JsonNode[]): PayloadContent => ({
  root: {
    type: "root",
    format: "",
    indent: 0,
    version: 1,
    direction: "ltr",
    children,
  },
});

/** The document's words, in order, whatever shape they are wrapped in. */
const words = (content: PayloadContent): string[] => {
  const out: string[] = [];
  const visit = (node: JsonNode) => {
    if (node.type === "text") out.push(String(node.text));
    (node.children ?? []).forEach(visit);
  };
  (content.root.children ?? []).forEach(visit);
  return out;
};

test.describe("U-TYPO proofreading one character at a time", () => {
  test("U-TYPO-1: the model is shown numbered lines, and never the parts it must not proofread", () => {
    const marked = toTypoText(
      document([
        block("heading", [text("標題")], { tag: "h2" }),
        block("paragraph", [text("第一段")]),
        image(7),
        // Spacing, not content. Numbering it would push every line after it
        // one out of step with the reply.
        block("paragraph", []),
        block(
          "list",
          [
            block("listitem", [text("甲")], { value: 1 }),
            block("listitem", [text("乙")], { value: 2 }),
          ],
          { listType: "bullet", tag: "ul", start: 1 },
        ),
        // 錯別字 in here are called identifiers.
        block("code", [text("const 己經 = 1")]),
      ]),
    );

    // Each list item on its own line: the model judges 的/得/地 from the
    // sentence, and three items joined into one line is not a sentence.
    expect(marked).toBe("1: 標題\n2: 第一段\n3: 甲\n4: 乙");
  });

  test("U-TYPO-2: an accepted correction changes that word, in that line, and leaves the rest alone", () => {
    const before = document([
      block("paragraph", [text("我己經跑完了")]),
      image(7),
      block("paragraph", [text("下一段也有己經兩個字")]),
    ]);

    const corrections = parseCorrections("2|己經|已經", before);
    expect(corrections).toHaveLength(1);
    expect(corrections[0].context).toBe("下一段也有己經兩個字");

    const after = applyCorrection(before, corrections[0])!;
    expect(after).not.toBeNull();
    // The line that was accepted, and only it. The identical typo in the
    // first paragraph is the member's until they accept its own card.
    expect(words(after)).toEqual(["我己經跑完了", "下一段也有已經兩個字"]);
    // The picture is not this feature's business, and a document rebuilt
    // rather than edited is how it would stop being there.
    expect(after.root.children![1]).toEqual(image(7));
    // Pure: the caller still holds what they passed in.
    expect(words(before)).toEqual(["我己經跑完了", "下一段也有己經兩個字"]);
  });

  test("U-TYPO-3: a correction that cannot be placed is never offered", () => {
    const content = document([
      block("paragraph", [text("己經又己經")]),
      block("paragraph", [text("我", 1), text("己經去了")]),
      block("paragraph", [text("一切正常")]),
    ]);

    expect(
      parseCorrections(
        [
          "以下是我找到的錯字：", // a preamble is not a correction
          "1|己經|已經", // twice in its line: which one?
          "3|不在這裡|已經", // not in the line at all
          "9|己經|已經", // a line number the article does not have
          "2|己經|己經", // changes nothing
          "3|一切正常|一切都很正常，沒有問題", // a rewrite wearing a correction's clothes
          "謝謝！",
        ].join("\n"),
        content,
      ),
    ).toEqual([]);
  });

  test("U-TYPO-4: a fragment split across bold is left to the member", () => {
    // 「己」 is bold and 「經」 is not, so there is no one node holding the
    // word and no answer to which half keeps the emphasis.
    const content = document([
      block("paragraph", [text("我"), text("己", 1), text("經跑完了")]),
    ]);

    expect(parseCorrections("1|己經|已經", content)).toEqual([]);
  });

  test("U-TYPO-5: a correction overtaken by the member's own editing is refused, not guessed at", () => {
    const scanned = document([block("paragraph", [text("我己經跑完了")])]);
    const [correction] = parseCorrections("1|己經|已經", scanned);
    expect(correction).toBeTruthy();

    // The member fixed it themselves while the list sat open — or wrote
    // something else entirely in that paragraph. Either way the fragment is
    // gone and where the change would land is a guess.
    const edited = document([block("paragraph", [text("我已經跑完了")])]);
    expect(applyCorrection(edited, correction)).toBeNull();

    // Still applies to the document it was found in.
    expect(words(applyCorrection(scanned, correction)!)).toEqual(["我已經跑完了"]);
  });

  test("U-TYPO-6: the same word wrong twice is two decisions", () => {
    const content = document([
      block("paragraph", [text("我己經到了")]),
      block("paragraph", [text("他也己經到了")]),
    ]);

    const corrections = parseCorrections("1|己經|已經\n2|己經|已經\n2|己經|已經", content);
    // Deduplicated: the same line, word and replacement twice is one card,
    // not two identical ones the member has to answer separately.
    expect(corrections.map((item) => item.line)).toEqual([1, 2]);

    // Accepting one leaves the other exactly as it was — which is the whole
    // point of a list rather than one 接受 for the article.
    const after = applyCorrection(content, corrections[1])!;
    expect(words(after)).toEqual(["我己經到了", "他也已經到了"]);
    expect(words(applyCorrection(after, corrections[0])!)).toEqual([
      "我已經到了",
      "他也已經到了",
    ]);
  });
});
