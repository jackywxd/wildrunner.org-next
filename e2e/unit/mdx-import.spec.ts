import { expect, test } from "@playwright/test";

import { importMarkdown } from "@/lib/mdx-import";
import { emptyContent } from "@/lib/editor/empty";
import { RECOGNIZED_TYPES } from "@/lib/editor/nodes";
import { roundTripPayloadContent } from "@/lib/editor/serialize";

/**
 * U-MDX — the markdown/MDX importer (`@/lib/mdx-import`).
 *
 * Pure function calls only: no clock, no network, no database, no browser.
 * Each test names the one failure it exists to catch, per
 * docs/testing-strategy.md. `newObjectIdHex` (used for every link/code id)
 * reads `crypto.getRandomValues`, so tests assert its *shape*
 * (`/^[0-9a-f]{24}$/`), never a specific value.
 */

type JsonNode = { type: string; children?: JsonNode[]; [key: string]: unknown };

function collectTypes(node: JsonNode, into: Set<string>): void {
  into.add(node.type);
  for (const child of node.children ?? []) collectTypes(child, into);
}

test.describe("U-MDX markdown import", () => {
  test("U-MDX-1: frontmatter title/description/date are lifted, and the block leaves no trace in the body", () => {
    const result = importMarkdown(
      ["---", "title: 前言標題", "description: 前言摘要", "date: 2026-01-02", "---", "", "內文段落"].join("\n"),
    );
    expect(result.title).toBe("前言標題");
    expect(result.description).toBe("前言摘要");
    expect(result.publishedAt).toBe(new Date("2026-01-02").toISOString());

    const nodes = new Set<string>();
    collectTypes(result.content.root as unknown as JsonNode, nodes);
    expect(nodes.has("yaml")).toBe(false);
  });

  test("U-MDX-2: with no frontmatter title, a leading H1 becomes the title and is removed from the body", () => {
    const result = importMarkdown(["# 內文標題", "", "接下來的段落"].join("\n"));
    expect(result.title).toBe("內文標題");

    const paragraphs = (result.content.root as unknown as JsonNode).children ?? [];
    expect(paragraphs.every((node) => node.type !== "heading")).toBe(true);
  });

  test("U-MDX-3: a block-form frontmatter value produces a warning instead of a mangled title", () => {
    const result = importMarkdown(["---", "title: |", "  多行標題", "---", "", "內文"].join("\n"));
    expect(result.title).toBe("");
    expect(result.warnings.some((w) => w.code === "frontmatter-unparsed")).toBe(true);
  });

  test("U-MDX-4: bold/italic/strikethrough/inline-code map to 1/2/4/16, and combine", () => {
    const result = importMarkdown("**b** *i* ~~s~~ `c` ~~`x`~~");
    const paragraph = (result.content.root as unknown as JsonNode).children![0];
    const formats = (paragraph.children ?? []).map((n) => n.format);
    expect(formats).toContain(1);
    expect(formats).toContain(2);
    expect(formats).toContain(4);
    expect(formats).toContain(16);
    expect(formats).toContain(20); // strikethrough(4) | code(16)
  });

  test("U-MDX-5: paragraph.textFormat is the first direct text child's format, 0 with none", () => {
    const bold = importMarkdown("**bold** tail");
    const p1 = (bold.content.root as unknown as JsonNode).children![0];
    expect(p1.textFormat).toBe(1);

    // A paragraph whose only direct child is a link (no direct text child).
    const link = importMarkdown("[text](https://example.com)");
    const p2 = (link.content.root as unknown as JsonNode).children![0];
    expect(p2.textFormat).toBe(0);

    // Empty paragraph.
    const empty = importMarkdown("");
    expect(empty.content).toEqual(emptyContent());
  });

  test("U-MDX-6: nested listitem indent equals nesting depth, to depth 2", () => {
    const result = importMarkdown(["- top", "  - nested1", "    - nested2"].join("\n"));
    const list = (result.content.root as unknown as JsonNode).children![0];
    const topItem = list.children![0];
    expect(topItem.indent).toBe(0);

    const nestedList = topItem.children!.find((n) => n.type === "list")!;
    const nestedItem1 = nestedList.children![0];
    expect(nestedItem1.indent).toBe(1);

    const nestedList2 = nestedItem1.children!.find((n) => n.type === "list")!;
    const nestedItem2 = nestedList2.children![0];
    expect(nestedItem2.indent).toBe(2);
  });

  test("U-MDX-7: bullet/ordered/task lists carry listType+tag+start, checked only on task items", () => {
    const bullet = importMarkdown("- a\n- b");
    const bulletList = (bullet.content.root as unknown as JsonNode).children![0];
    expect(bulletList.listType).toBe("bullet");
    expect(bulletList.tag).toBe("ul");
    expect(bulletList.children![0].checked).toBeUndefined();

    const ordered = importMarkdown("3. a\n4. b");
    const orderedList = (ordered.content.root as unknown as JsonNode).children![0];
    expect(orderedList.listType).toBe("number");
    expect(orderedList.tag).toBe("ol");
    expect(orderedList.start).toBe(3);

    const task = importMarkdown("- [ ] todo\n- [x] done");
    const taskList = (task.content.root as unknown as JsonNode).children![0];
    expect(taskList.listType).toBe("check");
    expect(taskList.children![0].checked).toBe(false);
    expect(taskList.children![1].checked).toBe(true);
  });

  test("U-MDX-8: a fence becomes a Code block node with a bson-objectid-shaped id", () => {
    const result = importMarkdown(["```js", "const x = 1;", "console.log(x);", "```"].join("\n"));
    const block = (result.content.root as unknown as JsonNode).children![0];
    expect(block.type).toBe("block");
    expect(block.version).toBe(2);
    const fields = block.fields as { blockType: string; language: string; code: string; id: string };
    expect(fields.blockType).toBe("Code");
    expect(fields.language).toBe("javascript");
    expect(fields.code).toBe("const x = 1;\nconsole.log(x);");
    expect(fields.id).toMatch(/^[0-9a-f]{24}$/);
  });

  test("U-MDX-9: a known fence alias maps to its full name; an unknown one falls back to plaintext with a warning", () => {
    const known = importMarkdown(["```js", "1", "```"].join("\n"));
    const knownBlock = (known.content.root as unknown as JsonNode).children![0];
    expect((knownBlock.fields as { language: string }).language).toBe("javascript");
    expect(known.warnings.some((w) => w.code === "unknown-code-language")).toBe(false);

    const unknown = importMarkdown(["```wat", "1", "```"].join("\n"));
    const unknownBlock = (unknown.content.root as unknown as JsonNode).children![0];
    expect((unknownBlock.fields as { language: string }).language).toBe("plaintext");
    expect(unknown.warnings.some((w) => w.code === "unknown-code-language")).toBe(true);
  });

  test("U-MDX-10: every image reference yields one warning and a placeholder, never an upload node", () => {
    const result = importMarkdown("![官方相片](./photo.jpg)\n\n text around ![inline](./b.jpg) image");
    expect(result.warnings.filter((w) => w.code === "image-not-imported")).toHaveLength(2);

    const types = new Set<string>();
    collectTypes(result.content.root as unknown as JsonNode, types);
    expect(types.has("upload")).toBe(false);

    const text = JSON.stringify(result.content);
    expect(text).toContain("官方相片");
    expect(text).toContain("./photo.jpg");
  });

  test("U-MDX-11: a YouTube tag becomes a paragraph whose sole text is the watch URL", () => {
    const result = importMarkdown('<YouTube id="abc123"/>');
    const paragraph = (result.content.root as unknown as JsonNode).children!.find(
      (node) => node.type === "paragraph",
    )!;
    expect(paragraph.children).toHaveLength(1);
    expect(paragraph.children![0].text).toBe("https://www.youtube.com/watch?v=abc123");
  });

  test("U-MDX-12: import/export lines vanish, an unknown JSX tag becomes a warned placeholder, fences are untouched", () => {
    const result = importMarkdown(
      ['import Foo from "foo";', "", "<Bar baz={1} />", "", "```js", 'import real from "code";', "```"].join(
        "\n",
      ),
    );
    const text = JSON.stringify(result.content);
    expect(text).not.toContain("import Foo");
    expect(text).toContain("不支援的元件: Bar");

    const nodes = (result.content.root as unknown as JsonNode).children!;
    const codeBlock = nodes.find((n) => n.type === "block")!;
    const fields = codeBlock.fields as { code: string };
    expect(fields.code).toBe('import real from "code";');
    expect(result.warnings.some((w) => w.code === "unsupported-component")).toBe(true);
  });

  test("U-MDX-13: a GFM table produces table>tablerow>tablecell>paragraph, header only on row 0", () => {
    const result = importMarkdown(["| a | b |", "|---|---|", "| 1 | 2 |"].join("\n"));
    const table = (result.content.root as unknown as JsonNode).children![0];
    expect(table.type).toBe("table");
    const tableRows = table.children!;
    expect(tableRows).toHaveLength(2);

    const headerCell = tableRows[0].children![0];
    expect(headerCell.type).toBe("tablecell");
    expect(headerCell.headerState).toBe(1);
    expect(headerCell.colSpan).toBe(1);
    expect(headerCell.rowSpan).toBe(1);
    expect(headerCell.backgroundColor).toBeNull();
    expect(headerCell.children![0].type).toBe("paragraph");

    const bodyCell = tableRows[1].children![0];
    expect(bodyCell.headerState).toBe(0);
  });

  test("U-MDX-14: soft and hard line breaks both become linebreak nodes", () => {
    const soft = importMarkdown("line one\nline two");
    const softParagraph = (soft.content.root as unknown as JsonNode).children![0];
    expect(softParagraph.children!.some((n) => n.type === "linebreak")).toBe(true);

    const hard = importMarkdown("line one  \nline two");
    const hardParagraph = (hard.content.root as unknown as JsonNode).children![0];
    expect(hardParagraph.children!.some((n) => n.type === "linebreak")).toBe(true);
  });

  test("U-MDX-15: quote, thematicBreak, headings h1-h6, and link all have their exact shapes", () => {
    const quote = importMarkdown("> quoted text");
    expect((quote.content.root as unknown as JsonNode).children![0].type).toBe("quote");

    const rule = importMarkdown("above\n\n---\n\nbelow");
    const hr = (rule.content.root as unknown as JsonNode).children!.find((n) => n.type === "horizontalrule")!;
    expect(hr).toEqual({ type: "horizontalrule", version: 1 });

    // Starts at depth 2: a leading depth-1 heading is consumed as the
    // title by design (U-MDX-2) and removed from the body, so it is not a
    // "heading node in the body" case this loop is testing.
    for (let depth = 2; depth <= 6; depth++) {
      const heading = importMarkdown(`intro\n\n${"#".repeat(depth)} h${depth}`);
      const node = (heading.content.root as unknown as JsonNode).children![1];
      expect(node.type).toBe("heading");
      expect(node.tag).toBe(`h${depth}`);
    }

    const link = importMarkdown("[text](https://example.com)");
    const linkParagraph = (link.content.root as unknown as JsonNode).children![0];
    const linkNode = linkParagraph.children![0];
    expect(linkNode.type).toBe("link");
    expect(linkNode.version).toBe(3);
    expect(linkNode.fields).toEqual({ linkType: "custom", newTab: false, url: "https://example.com" });
    expect(linkNode.id).toMatch(/^[0-9a-f]{24}$/);
  });

  test("U-MDX-16: a document exercising every construct round-trips byte-for-byte through the real editor", () => {
    const source = [
      "---",
      "title: 綜合測試",
      "---",
      "",
      "段落含 **粗體** *斜體* ~~刪除線~~ `代碼`。",
      "",
      // Starts with bold, not plain text — the paragraph whose recomputed
      // `textFormat` is non-zero. A fixture where every paragraph happens to
      // start with plain (format 0) text would round-trip even with
      // `paragraphTextFormat` hard-coded to `0`, silently passing this test
      // while the real bug (recorded in to-lexical.ts's comment on that
      // function) shipped. Verified: reverting that function to always
      // return `0` turns this test red without this paragraph, and did not
      // before it was added.
      "**開頭就是粗體** 的段落。",
      "",
      // Starts with a link — no direct text child at all, so the correct
      // `textFormat` is 0 by the *other* branch of the same rule.
      "[純連結開頭](https://example.com) 之後接文字。",
      "",
      "- 項目一",
      "  - 巢狀項目",
      "- 項目二",
      "",
      "1. 第一",
      "2. 第二",
      "",
      "- [ ] 待辦",
      "- [x] 已完成",
      "",
      "> 引言第一行",
      "> 引言第二行",
      "",
      "---",
      "",
      "```js",
      "const x = 1;",
      "```",
      "",
      "![alt](./x.jpg)",
      "",
      "[連結文字](https://example.com)",
      "",
      "第一行\\",
      "第二行",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      '<YouTube id="abc"/>',
    ].join("\n");

    const result = importMarkdown(source);
    const roundTripped = roundTripPayloadContent(result.content);
    expect(roundTripped).toEqual(result.content);
  });

  test("U-MDX-17: unsupported constructs warn, and every emitted node type is one the member editor recognizes", () => {
    const result = importMarkdown(
      [
        "[[footnote]][^1]",
        "",
        "[^1]: a footnote definition",
        "",
        "<div>raw html block</div>",
        "",
        "text with <span>inline html</span> around it",
      ].join("\n"),
    );

    const nodes = new Set<string>();
    collectTypes(result.content.root as unknown as JsonNode, nodes);
    const allowed = new Set([...RECOGNIZED_TYPES, "block"]);
    for (const type of nodes) {
      expect(allowed.has(type), `emitted an unrecognized node type: ${type}`).toBe(true);
    }
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("U-MDX-18: an empty or whitespace-only source produces the exact empty document", () => {
    expect(importMarkdown("").content).toEqual(emptyContent());
    expect(importMarkdown("   \n\n   ").content).toEqual(emptyContent());
  });

  test("U-MDX-19: an ASCII title yields a slug; a Chinese-only title yields an empty slug", () => {
    const ascii = importMarkdown("# Hello World");
    expect(ascii.slug).toBe("hello-world");

    const chinese = importMarkdown("# 純中文標題");
    expect(chinese.slug).toBe("");
  });

  test("U-MDX-20: a block-level HTML/SVG element is sanitized and stored as an HtmlEmbed block", () => {
    const result = importMarkdown(
      ["<figure><svg><rect width=\"1\" height=\"1\"/></svg></figure>", ""].join("\n"),
    );
    const node = (result.content.root as unknown as JsonNode).children![0];
    expect(node.type).toBe("block");
    const fields = node.fields as { blockType: string; html: string; id: string };
    expect(fields.blockType).toBe("HtmlEmbed");
    expect(fields.id).toMatch(/^[0-9a-f]{24}$/);
    expect(fields.html).toContain("<svg>");
    expect(result.warnings.some((w) => w.code === "html-embedded")).toBe(true);
  });

  test("U-MDX-21: <script>, event-handler attributes, and javascript: URLs never reach the stored HTML", () => {
    const attacks = [
      "<div>\n<script>alert(1)</script>\n</div>",
      '<img src="x" onerror="alert(1)">',
      '<svg onload="alert(1)"><rect width="1" height="1"/></svg>',
      '<a href="javascript:alert(1)">click</a>',
      "<svg><foreignObject><body><script>alert(1)</script></body></foreignObject></svg>",
      "<iframe src=\"https://evil.example\"></iframe>",
    ];
    for (const attack of attacks) {
      const result = importMarkdown([attack, ""].join("\n"));
      const stored = JSON.stringify(result.content);
      expect(stored, `leaked from: ${attack}`).not.toContain("<script");
      expect(stored, `leaked from: ${attack}`).not.toContain("onerror");
      expect(stored, `leaked from: ${attack}`).not.toContain("onload");
      expect(stored, `leaked from: ${attack}`).not.toContain("javascript:");
      expect(stored, `leaked from: ${attack}`).not.toContain("<iframe");
      expect(stored, `leaked from: ${attack}`).not.toContain("foreignObject");
    }
  });

  test("U-MDX-22: JSX camelCase attributes (className, textAnchor) become real HTML/SVG attributes", () => {
    const result = importMarkdown(
      [
        '<figure className="viz-root"><svg><text textAnchor="middle">x</text></svg></figure>',
        "",
      ].join("\n"),
    );
    const fields = (result.content.root as unknown as JsonNode).children![0]
      .fields as { html: string };
    // This is the exact regression a first version of the sanitizer had:
    // the schema allowed the attribute under the wrong key (`class` instead
    // of the hast-internal `className`), so it was silently dropped
    // instead of erroring — this assertion is what would have caught it.
    expect(fields.html).toContain('class="viz-root"');
    expect(fields.html).toContain("text-anchor=\"middle\"");
    expect(fields.html).not.toContain("className");
    expect(fields.html).not.toContain("textAnchor");
  });

  test("U-MDX-23: a <style>{`...`}</style> template-literal wrapper unwraps to a plain <style> tag", () => {
    const result = importMarkdown(
      ["<style>{`.x { color: red; }`}</style>", ""].join("\n"),
    );
    const fields = (result.content.root as unknown as JsonNode).children![0]
      .fields as { html: string };
    expect(fields.html).toContain("<style>");
    expect(fields.html).toContain(".x { color: red; }");
    expect(fields.html).not.toContain("{`");
  });

  test("U-MDX-24: an HtmlEmbed block round-trips byte-for-byte through the real editor", () => {
    const result = importMarkdown(
      ['<figure className="viz-root"><svg viewBox="0 0 10 10"><rect width="1" height="1"/></svg></figure>', ""].join(
        "\n",
      ),
    );
    const roundTripped = roundTripPayloadContent(result.content);
    expect(roundTripped).toEqual(result.content);
  });

  test("U-MDX-25: a base64 data-URI image is not resolved by the synchronous converter alone", () => {
    // 1x1 red pixel PNG.
    const pixel =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const result = importMarkdown(`![a pixel](data:image/png;base64,${pixel})`);
    const stored = JSON.stringify(result.content);
    // `importMarkdown` is synchronous and does no network I/O by design —
    // an embedded image is still a marker at this point, not an `upload`
    // node, and deliberately not a type the member editor recognizes
    // (`RECOGNIZED_TYPES`), so it must never reach `createPost` unresolved.
    expect(stored).toContain("pending-embedded-image");
    expect(stored).not.toContain('"type":"upload"');
    expect(RECOGNIZED_TYPES.has("pending-embedded-image")).toBe(false);
  });

  test("U-MDX-26: resolveEmbeddedImages replaces the marker with a real upload node on success", async () => {
    const { resolveEmbeddedImages } = await import("@/lib/mdx-import/resolve-embedded-images");
    const pixel =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const result = importMarkdown(`![a pixel](data:image/png;base64,${pixel})`);

    const resolved = await resolveEmbeddedImages(result.content, async ({ mimeType, bytes }) => {
      expect(mimeType).toBe("image/png");
      expect(bytes.length).toBeGreaterThan(0);
      return { id: 42 };
    });

    const stored = JSON.stringify(resolved.content);
    expect(stored).not.toContain("pending-embedded-image");
    expect(stored).toContain('"type":"upload"');
    expect(stored).toContain('"value":42');
    expect(resolved.warnings.some((w) => w.code === "image-embedded")).toBe(true);

    const roundTripped = roundTripPayloadContent(resolved.content);
    expect(roundTripped).toEqual(resolved.content);
  });

  test("U-MDX-27: resolveEmbeddedImages falls back to a text placeholder when the upload fails", async () => {
    const { resolveEmbeddedImages } = await import("@/lib/mdx-import/resolve-embedded-images");
    const pixel =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const result = importMarkdown(`![a pixel](data:image/png;base64,${pixel})`);

    const resolved = await resolveEmbeddedImages(result.content, async () => {
      throw new Error("quota exceeded");
    });

    const stored = JSON.stringify(resolved.content);
    expect(stored).not.toContain("pending-embedded-image");
    expect(stored).not.toContain('"type":"upload"');
    expect(stored).toContain("圖片未匯入");
    expect(resolved.warnings.some((w) => w.code === "image-embed-failed")).toBe(true);
  });
});
