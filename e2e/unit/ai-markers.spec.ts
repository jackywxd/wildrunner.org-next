import { expect, test } from "@playwright/test";

import { fromAIText, marker, toAIText } from "@/lib/editor/ai-markers";
import type { JsonNode, PayloadContent } from "@/lib/editor/serialize";

/**
 * U-AIMARK — a member's pictures survive a trip through a language model.
 *
 * The model is given text and returns text, so everything that is not text
 * has to be held back and put again where it was. These are the boundaries
 * of that: what the model is shown, what comes back, and — the one that
 * matters — what happens when the model does not do as it is told.
 *
 * A model dropping a line is ordinary. A member's photograph disappearing
 * out of their article because of it is not, and it is not visible either:
 * the AI column looks like a finished article whether or not the picture is
 * in it. So the invariant is asserted directly, in the case that breaks it.
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

const types = (content: PayloadContent) =>
  (content.root.children ?? []).map((node) => node.type);

test.describe("U-AIMARK marking a document for a language model", () => {
  test("U-AIMARK-1: the model is shown prose, and a marker wherever it must not look", () => {
    const marked = toAIText(
      document([
        block("paragraph", [text("第一段")]),
        image(7),
        block("paragraph", [text("第二段")]),
      ]),
    );

    expect(marked.text).toBe(`第一段\n\n${marker(0)}\n\n第二段`);
    // The node itself never reaches the request body — only its number does.
    expect(marked.blocks).toHaveLength(1);
    expect(marked.blocks[0].node).toEqual(image(7));
    expect(marked.text).not.toContain("upload");
  });

  test("U-AIMARK-2: headings, quotes, lists and inline emphasis make the round trip", () => {
    const original = document([
      block("heading", [text("標題")], { tag: "h2" }),
      block("paragraph", [text("粗", 1), text("／"), text("斜", 2), text("／"), text("碼", 16)]),
      block("quote", [text("引用")]),
      block(
        "list",
        [
          block("listitem", [text("甲")], { value: 1 }),
          block("listitem", [text("乙")], { value: 2 }),
        ],
        { listType: "bullet", tag: "ul", start: 1 },
      ),
    ]);

    const marked = toAIText(original);
    expect(marked.text).toBe("## 標題\n\n**粗**／*斜*／`碼`\n\n> 引用\n\n- 甲\n- 乙");

    // Structure a member can see: a heading that came back as a paragraph
    // is a heading they have to make again.
    const back = fromAIText(marked.text, marked.blocks);
    expect(types(back)).toEqual(["heading", "paragraph", "quote", "list"]);
    expect(back.root.children![0].tag).toBe("h2");
    expect(back.root.children![3].listType).toBe("bullet");
    expect(back.root.children![1].children).toEqual([
      text("粗", 1),
      text("／"),
      text("斜", 2),
      text("／"),
      text("碼", 16),
    ]);
  });

  test("U-AIMARK-3: the picture lands where the marker came back, not where it started", () => {
    const marked = toAIText(
      document([block("paragraph", [text("原本在圖片前面")]), image(7)]),
    );

    // The model rewrote the prose into two paragraphs and moved the marker
    // up between them, which is exactly what it is allowed to do.
    const back = fromAIText(
      `改寫後的第一段\n\n${marker(0)}\n\n改寫後的第二段`,
      marked.blocks,
    );

    expect(types(back)).toEqual(["paragraph", "upload", "paragraph"]);
    expect(back.root.children![1]).toEqual(image(7));
  });

  test("U-AIMARK-4: a marker the model loses does not lose the picture", () => {
    const marked = toAIText(
      document([
        block("paragraph", [text("第一段")]),
        image(7),
        block("paragraph", [text("第二段")]),
      ]),
    );

    // Every marker gone — the failure this whole mechanism is defended
    // against, and the one that is invisible on screen.
    const back = fromAIText("改寫後的第一段\n\n改寫後的第二段", marked.blocks);

    expect(types(back)).toEqual(["paragraph", "upload", "paragraph"]);
    expect(back.root.children![1]).toEqual(image(7));
  });

  test("U-AIMARK-5: a marker the model invents or repeats adds nothing", () => {
    const marked = toAIText(document([image(7), block("paragraph", [text("說明")])]));

    const back = fromAIText(
      `${marker(0)}\n\n${marker(0)}\n\n${marker(9)}\n\n說明`,
      marked.blocks,
    );

    // One picture existed, so one picture comes back. A second copy would
    // be a photograph the member never placed.
    expect(types(back)).toEqual(["upload", "paragraph"]);
  });

  test("U-AIMARK-6: everything that is not prose is held back, not just images", () => {
    const table = block("table", [], {});
    const rule: JsonNode = { type: "horizontalrule", version: 1 };
    const code: JsonNode = {
      type: "block",
      version: 2,
      fields: { blockType: "Code", code: "print(1)" },
    };

    const marked = toAIText(
      document([table, block("paragraph", [text("中間")]), rule, code]),
    );

    expect(marked.blocks.map((entry) => entry.node.type)).toEqual([
      "table",
      "horizontalrule",
      "block",
    ]);
    // A table described back as a sentence is a table destroyed, so none of
    // its text is in what the model reads.
    expect(marked.text).toBe(`${marker(0)}\n\n中間\n\n${marker(1)}\n\n${marker(2)}`);

    const back = fromAIText(marked.text, marked.blocks);
    expect(types(back)).toEqual(["table", "paragraph", "horizontalrule", "block"]);
  });
});
