import { newObjectIdHex } from "@/lib/editor/object-id";
import { emptyContent } from "@/lib/editor/empty";
import { codeLanguage } from "./languages";
import { sanitizeEmbeddedHtml } from "./html-embed";
import type { PayloadContent } from "@/lib/editor/serialize";
import type { ImportWarning } from "./types";

/**
 * Loosely-typed mdast node — no `@types/mdast` is resolvable in this repo
 * (not even transitively; verified), so this is a minimal shape covering
 * the fields this walker actually reads, matching the loose-typing pattern
 * `serialize.ts`'s `JsonNode` already uses for the Lexical side.
 */
type MdastNode = {
  align?: (string | null)[];
  alt?: string | null;
  checked?: boolean | null;
  children?: MdastNode[];
  depth?: number;
  lang?: string | null;
  ordered?: boolean;
  start?: number | null;
  title?: string | null;
  type: string;
  url?: string;
  value?: string;
  [key: string]: unknown;
};

type JsonNode = {
  type: string;
  children?: JsonNode[];
  [key: string]: unknown;
};

/**
 * Lexical 0.41.0's TEXT_TYPE_TO_FORMAT bitmask, the subset this converter
 * produces. Verified against the real `lexical` package (`$createTextNode`
 * + `setFormat` + `toJSON()`).
 */
const FORMAT_BOLD = 1;
const FORMAT_ITALIC = 2;
const FORMAT_STRIKETHROUGH = 4;
const FORMAT_CODE = 16;

function el(type: string, children: JsonNode[], extra: Record<string, unknown> = {}): JsonNode {
  return { children, direction: null, format: "", indent: 0, type, version: 1, ...extra };
}

function textNode(text: string, format = 0): JsonNode {
  return { detail: 0, format, mode: "normal", style: "", text, type: "text", version: 1 };
}

function linebreakNode(): JsonNode {
  return { type: "linebreak", version: 1 };
}

/**
 * `paragraph.textFormat` is not a value the importer is free to choose —
 * `ParagraphNode.exportJSON` (lexical 0.41.0) recomputes it from the first
 * *direct text* child when the node itself carries none, and this walker
 * never sets a node-level `__textFormat`, so every paragraph goes through
 * that recompute. Verified by building the real node: a paragraph whose
 * first child is a `link` (not text) and whose second child is bold text
 * comes back with `textFormat: 1` — the format of the first *text* sibling,
 * not of children[0]. A paragraph with no direct text child at all (only a
 * link, or nothing) comes back `0`. Getting this wrong doesn't throw: the
 * document silently changes shape the moment the member's first save runs
 * it through the real editor.
 */
function paragraphTextFormat(children: JsonNode[]): number {
  const firstText = children.find((child) => child.type === "text");
  return typeof firstText?.format === "number" ? firstText.format : 0;
}

/** Splits a run of text on embedded `\n` (mdast's soft-break representation) into text/linebreak nodes. */
function splitSoftBreaks(text: string, format: number): JsonNode[] {
  const parts = text.split("\n");
  const nodes: JsonNode[] = [];
  parts.forEach((part, index) => {
    if (part !== "") nodes.push(textNode(part, format));
    if (index < parts.length - 1) nodes.push(linebreakNode());
  });
  return nodes;
}

function imagePlaceholder(alt: string | null | undefined, url: string, warnings: ImportWarning[]): JsonNode[] {
  const label = alt && alt.trim() !== "" ? alt : "圖片";
  warnings.push({
    code: "image-not-imported",
    message: `圖片「${label}」未匯入，需要手動上傳並補上`,
    detail: url,
  });
  return [textNode(`［圖片未匯入：${label}（${url}）］`)];
}

const DATA_URI_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,/i;

/**
 * A `data:image/...;base64,...` URL — the image bytes are already in the
 * document, not a path this converter would have to fetch (which nothing
 * here does, matching `Media.upload.pasteURL: false` and
 * `ImageInsertPlugin`'s refusal to re-host remote images).
 *
 * Emits a marker type, not a real Lexical node: uploading needs network
 * I/O, which this function — and `mdastToLexical` as a whole — deliberately
 * does not do (see that function's header). `resolve-embedded-images.ts`
 * is the second, async pass that replaces every one of these with a real
 * `upload` node or, on failure, the same text placeholder a non-embedded
 * image gets. `pending-embedded-image` is deliberately outside
 * `RECOGNIZED_TYPES ∪ {"block"}` for exactly this reason — if it were ever
 * to reach the member editor unresolved, it should fail loudly (Lexical
 * throws on an unregistered type) rather than silently render as nothing.
 */
function embeddedImagePlaceholder(alt: string | null | undefined, dataUri: string): JsonNode {
  return {
    type: "pending-embedded-image",
    version: 1,
    dataUri,
    alt: alt && alt.trim() !== "" ? alt : "圖片",
  };
}

/** Converts a run of mdast inline (phrasing) nodes into Lexical inline nodes, carrying an inherited format bitmask. */
function inline(nodes: MdastNode[], format: number, warnings: ImportWarning[]): JsonNode[] {
  const out: JsonNode[] = [];
  for (const node of nodes) {
    out.push(...inlineOne(node, format, warnings));
  }
  return out;
}

function inlineOne(node: MdastNode, format: number, warnings: ImportWarning[]): JsonNode[] {
  switch (node.type) {
    case "text":
      return splitSoftBreaks(node.value ?? "", format);
    case "break":
      return [linebreakNode()];
    case "strong":
      return inline(node.children ?? [], format | FORMAT_BOLD, warnings);
    case "emphasis":
      return inline(node.children ?? [], format | FORMAT_ITALIC, warnings);
    case "delete":
      return inline(node.children ?? [], format | FORMAT_STRIKETHROUGH, warnings);
    case "inlineCode":
      return [textNode(node.value ?? "", format | FORMAT_CODE)];
    case "link": {
      const linkChildren = node.children ?? [];
      // A bare URL — typed plain or produced by the YouTube-tag rewrite in
      // normalize.ts — parses through remark-gfm's autolink-literal
      // extension as a `link` node whose sole text child equals the url,
      // structurally identical to CommonMark's `<https://x>` autolink
      // syntax. The member editor has no autolink (see
      // markdown-transformers.ts), so a real Lexical `link` node here would
      // misrepresent what the member typed — and `soleYouTubeUrl` in
      // `payload-rich-text.tsx` specifically requires a bare *text* child
      // to recognise a paragraph as a video embed; a `link` node there
      // contributes a space instead and the embed silently fails to
      // render. Detected structurally (text === url) rather than by
      // remark-gfm's internal node metadata, which is undocumented and not
      // worth depending on.
      const isBareUrl =
        linkChildren.length === 1 &&
        linkChildren[0].type === "text" &&
        linkChildren[0].value === node.url;
      if (isBareUrl) {
        return splitSoftBreaks(node.url ?? "", format);
      }

      const children = inline(linkChildren, format, warnings);
      return [
        el("link", children, {
          fields: { linkType: "custom", newTab: false, url: node.url ?? "" },
          id: newObjectIdHex(),
          version: 3,
        }),
      ];
    }
    case "image": {
      const url = node.url ?? "";
      if (DATA_URI_IMAGE.test(url)) {
        return [embeddedImagePlaceholder(node.alt, url)];
      }
      return imagePlaceholder(node.alt, url, warnings);
    }
    case "imageReference": {
      const identifier = (node as { identifier?: string }).identifier ?? "";
      return imagePlaceholder(node.alt, `#${identifier}`, warnings);
    }
    case "linkReference": {
      warnings.push({
        code: "unsupported-syntax",
        message: "參照式連結未展開，已改為純文字",
      });
      return inline(node.children ?? [], format, warnings);
    }
    case "footnoteReference": {
      const identifier = (node as { identifier?: string }).identifier ?? "";
      warnings.push({
        code: "unsupported-syntax",
        message: `註腳參照「${identifier}」未匯入`,
      });
      return [];
    }
    case "html":
      warnings.push({
        code: "unsupported-syntax",
        message: "行內 HTML 標籤已移除，文字內容保留",
        detail: (node.value ?? "").slice(0, 40),
      });
      return [];
    default:
      warnings.push({
        code: "unsupported-syntax",
        message: `不支援的內文型別「${node.type}」已略過`,
      });
      return [];
  }
}

/** listitem.indent must equal nesting depth (verified against the real ListItemNode). */
function listNode(node: MdastNode, depth: number, warnings: ImportWarning[]): JsonNode[] {
  const items = node.children ?? [];
  const isCheckList = items.some((item) => item.checked !== null && item.checked !== undefined);
  const listType = isCheckList ? "check" : node.ordered ? "number" : "bullet";
  const tag = node.ordered && !isCheckList ? "ol" : "ul";
  const start = node.ordered ? node.start ?? 1 : 1;

  const hoisted: JsonNode[] = [];
  const itemNodes = items.map((item, index) =>
    listItemNode(item, index + 1, depth, isCheckList, hoisted, warnings),
  );

  return [el("list", itemNodes, { listType, start, tag }), ...hoisted];
}

function listItemNode(
  item: MdastNode,
  value: number,
  depth: number,
  isCheckList: boolean,
  hoisted: JsonNode[],
  warnings: ImportWarning[],
): JsonNode {
  const children: JsonNode[] = [];
  for (const child of item.children ?? []) {
    if (child.type === "paragraph") {
      children.push(...inline(child.children ?? [], 0, warnings));
    } else if (child.type === "list") {
      children.push(...listNode(child, depth + 1, warnings));
    } else {
      // A block other than a leading paragraph or a nested list (a
      // blockquote or fenced code sitting inside a list item, say) — moved
      // out to just after the whole list rather than invented as a shape
      // Lexical's listitem was never meant to hold.
      warnings.push({
        code: "unsupported-syntax",
        message: "清單項目內的區塊內容已搬到清單之後",
      });
      hoisted.push(...blockNode(child, warnings));
    }
  }

  const extra: Record<string, unknown> = { indent: depth, value };
  if (isCheckList) extra.checked = item.checked === true;
  return el("listitem", children, extra);
}

/** blockquote holds inline content in Lexical, not blocks — paragraphs are joined with linebreaks. */
function quoteNode(node: MdastNode, warnings: ImportWarning[]): JsonNode[] {
  const children: JsonNode[] = [];
  const hoisted: JsonNode[] = [];
  const blockChildren = node.children ?? [];

  blockChildren.forEach((child, index) => {
    if (child.type === "paragraph") {
      if (index > 0 && children.length > 0) children.push(linebreakNode());
      children.push(...inline(child.children ?? [], 0, warnings));
    } else {
      warnings.push({
        code: "unsupported-syntax",
        message: "引用區塊內的清單或程式碼已搬到引用之後",
      });
      hoisted.push(...blockNode(child, warnings));
    }
  });

  return [el("quote", children), ...hoisted];
}

function tableCellNode(cell: MdastNode, headerState: number, warnings: ImportWarning[]): JsonNode {
  const content = inline(cell.children ?? [], 0, warnings);
  const paragraph = el("paragraph", content, {
    textFormat: paragraphTextFormat(content),
    textStyle: "",
  });
  return el("tablecell", [paragraph], {
    backgroundColor: null,
    colSpan: 1,
    headerState,
    rowSpan: 1,
  });
}

function tableNode(node: MdastNode, warnings: ImportWarning[]): JsonNode {
  const rows = (node.children ?? []).map((row, rowIndex) => {
    const headerState = rowIndex === 0 ? 1 : 0; // TableCellHeaderStates.ROW, verified
    const cells = (row.children ?? []).map((cell) => tableCellNode(cell, headerState, warnings));
    return el("tablerow", cells);
  });
  return el("table", rows);
}

function codeBlockNode(node: MdastNode, warnings: ImportWarning[]): JsonNode {
  const { language, warning } = codeLanguage(node.lang);
  if (warning) warnings.push(warning);
  warnings.push({
    code: "code-block-not-editable",
    message: "程式碼區塊會保留並在公開頁正常顯示，但目前無法在編輯器內修改",
  });
  return {
    type: "block",
    format: "",
    version: 2,
    fields: {
      blockType: "Code",
      language,
      code: node.value ?? "",
      id: newObjectIdHex(),
    },
  };
}

/**
 * A block-level mdast `html` node — raw HTML/SVG the member's document
 * embedded directly, not something `remark-parse` understands as structure
 * (verified: `<figure><svg>…</svg></figure>` arrives as one opaque `html`
 * node with the whole subtree in `.value`). Sanitized once here, at import
 * time, and stored in an `HtmlEmbed` block (`src/blocks/HtmlEmbedBlock.ts`)
 * — see that file and `html-embed.ts`'s header for the sanitizer's threat
 * model and what it does and does not stop.
 *
 * An empty sanitizer result (the whole block was disallowed content, e.g.
 * a bare `<script>`) emits nothing rather than a block with an empty
 * `html` field — `HtmlEmbedBlock.html` is `required: true`, and an empty
 * block would be pure clutter with nothing left to show.
 */
function htmlEmbedBlock(raw: string, warnings: ImportWarning[]): JsonNode[] {
  const { html, warnings: htmlWarnings } = sanitizeEmbeddedHtml(raw);
  if (html.trim() === "") {
    warnings.push({
      code: "unsupported-syntax",
      message: "這段 HTML 內容經過安全過濾後已無剩餘內容，已略過",
      detail: raw.slice(0, 40),
    });
    return [];
  }

  warnings.push(...htmlWarnings);
  return [
    {
      type: "block",
      format: "",
      version: 2,
      fields: {
        blockType: "HtmlEmbed",
        html,
        id: newObjectIdHex(),
      },
    },
  ];
}

function blockNode(node: MdastNode, warnings: ImportWarning[]): JsonNode[] {
  switch (node.type) {
    case "yaml":
    case "definition":
      // Frontmatter is consumed separately by frontmatter.ts; a `definition`
      // (the target of a reference link/image) is invisible in the source
      // too, so dropping it silently matches what the author already sees.
      return [];
    case "heading": {
      const depth = Math.min(Math.max(node.depth ?? 1, 1), 6);
      const children = inline(node.children ?? [], 0, warnings);
      return [el("heading", children, { tag: `h${depth}` })];
    }
    case "paragraph": {
      const children = inline(node.children ?? [], 0, warnings);
      return [el("paragraph", children, { textFormat: paragraphTextFormat(children), textStyle: "" })];
    }
    case "list":
      return listNode(node, 0, warnings);
    case "blockquote":
      return quoteNode(node, warnings);
    case "thematicBreak":
      return [{ type: "horizontalrule", version: 1 }];
    case "code":
      return [codeBlockNode(node, warnings)];
    case "table":
      return [tableNode(node, warnings)];
    case "html":
      return htmlEmbedBlock(node.value ?? "", warnings);
    case "footnoteDefinition": {
      const identifier = (node as { identifier?: string }).identifier ?? "";
      warnings.push({
        code: "unsupported-syntax",
        message: `註腳定義「${identifier}」未匯入`,
      });
      return [];
    }
    default:
      warnings.push({
        code: "unsupported-syntax",
        message: `不支援的區塊型別「${node.type}」已略過`,
      });
      return [];
  }
}

/**
 * Converts an mdast root (with any frontmatter `yaml` node and, if the
 * caller already extracted a leading H1 as the title, that heading, both
 * already removed) into the exact shape Payload's `content` field stores.
 *
 * The invariant every unit test in `U-MDX-17` pins down: every `type` this
 * function can emit is a member of `RECOGNIZED_TYPES` (the member editor's
 * node set, imported from `@/lib/editor/nodes`) or `"block"` — the one type
 * `serialize.ts`'s `fromPayloadContent` knows how to carry opaquely.
 * `blockNode`'s `switch` and `inlineOne`'s `switch` are the two places that
 * boundary is enforced: anything not named there falls to the catch-all
 * branch, which warns and drops rather than emitting an unregistered type.
 */
export function mdastToLexical(tree: MdastNode, warnings: ImportWarning[]): PayloadContent {
  const children = (tree.children ?? []).flatMap((node) => blockNode(node, warnings));
  if (children.length === 0) return emptyContent();
  return {
    root: { type: "root", children, direction: null, format: "", indent: 0, version: 1 },
  };
}
