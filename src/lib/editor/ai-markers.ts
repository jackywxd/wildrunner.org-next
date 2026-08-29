import type { JsonNode, PayloadContent } from "./serialize";

/**
 * Handing a member's article to a language model, and getting it back with
 * the pictures still in it.
 *
 * The model is given text and returns text. A document is not text: it holds
 * images, tables, code blocks and rules, and every one of those would be
 * destroyed by a round trip through prose — either dropped outright or
 * described back as a sentence. Sending only the paragraphs and re-attaching
 * the rest afterwards does not work either, because "afterwards" has no
 * position: the model reorders, merges and splits paragraphs, so an image
 * that sat between the third and fourth paragraph has nowhere to go.
 *
 * So each of those nodes leaves a `[[BLOCK-n]]` line in its place. The
 * prompt tells the model to carry the markers through untouched, and where
 * a marker comes back is where the node goes. That is the member's own
 * instruction — "mark the position before calling the AI, tell it not to
 * change the marker, and put the image back where the marker is".
 *
 * **A marker the model loses must not lose the node.** Models drop lines.
 * `fromAIText` therefore treats the markers as a checklist rather than as
 * the only route home: anything unaccounted for is re-inserted at the index
 * it held in the original document. An image landing in roughly the right
 * place is a small annoyance; an image silently deleted from somebody's
 * article by a button labelled 完善 is not recoverable from the screen —
 * they would have to notice, and then find the file again.
 *
 * Everything here is pure and works on the plain JSON Payload stores, so
 * the whole round trip is testable without an editor, a browser or a model.
 */

/** Block types whose text the model may rewrite. Everything else is opaque. */
const REWRITABLE = new Set(["paragraph", "heading", "quote", "list"]);

const FORMAT_BOLD = 1;
const FORMAT_ITALIC = 2;
const FORMAT_STRIKETHROUGH = 4;
const FORMAT_CODE = 16;

/** The line that stands in for one opaque node. */
export const marker = (index: number) => `[[BLOCK-${index}]]`;

const MARKER_LINE = /^\s*\[\[BLOCK-(\d+)\]\]\s*$/;

export type MarkedDocument = {
  /** What the model is asked to improve. */
  text: string;
  /**
   * The nodes it never sees, by marker number, each remembering where it sat
   * among the document's blocks so a lost marker is still recoverable.
   */
  blocks: { index: number; node: JsonNode }[];
};

/* ------------------------------------------------------------------ */
/* document -> text                                                     */
/* ------------------------------------------------------------------ */

function inlineToText(children: JsonNode[] | undefined): string {
  return (children ?? [])
    .map((node) => {
      if (node.type === "linebreak") return "\n";
      if (node.type === "link") {
        const url = (node.fields as { url?: string } | undefined)?.url ?? "";
        return `[${inlineToText(node.children)}](${url})`;
      }
      if (node.type !== "text") return "";

      let text = String(node.text ?? "");
      if (!text) return "";
      const format = typeof node.format === "number" ? node.format : 0;
      // Innermost first, so `***bold italic***` nests the way the markdown
      // transformers in markdown-transformers.ts read it back.
      if (format & FORMAT_CODE) text = `\`${text}\``;
      if (format & FORMAT_STRIKETHROUGH) text = `~~${text}~~`;
      if (format & FORMAT_ITALIC) text = `*${text}*`;
      if (format & FORMAT_BOLD) text = `**${text}**`;
      return text;
    })
    .join("");
}

function blockToText(node: JsonNode): string {
  switch (node.type) {
    case "heading": {
      const tag = String(node.tag ?? "h2");
      const level = /^h([1-6])$/.exec(tag)?.[1] ?? "2";
      return `${"#".repeat(Number(level))} ${inlineToText(node.children)}`;
    }
    case "quote":
      return inlineToText(node.children)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "list": {
      const ordered = node.listType === "number";
      return (node.children ?? [])
        .map((child, i) =>
          ordered
            ? `${i + 1}. ${inlineToText(child.children)}`
            : `- ${inlineToText(child.children)}`,
        )
        .join("\n");
    }
    default:
      return inlineToText(node.children);
  }
}

/**
 * Split a document into the text the model improves and the nodes it must
 * not see.
 *
 * A rewritable block that is *empty* still becomes a blank in the text and
 * is simply lost, which is right: an empty paragraph is spacing, not
 * content, and asking a model to preserve one is asking it to preserve
 * nothing.
 */
export function toAIText(content: PayloadContent): MarkedDocument {
  const children = content.root.children ?? [];
  const blocks: MarkedDocument["blocks"] = [];
  const lines: string[] = [];

  children.forEach((node, index) => {
    if (REWRITABLE.has(node.type)) {
      const text = blockToText(node);
      if (text.trim()) lines.push(text);
      return;
    }
    blocks.push({ index, node });
    lines.push(marker(blocks.length - 1));
  });

  return { text: lines.join("\n\n"), blocks };
}

/**
 * The document's prose, with nothing standing in for what was left out.
 *
 * `toAIText` is for asking the model to give a document *back*, so the
 * pictures leave a marker where they stood. Summarising asks for something
 * new and short, and there a marker is only a liability: a model that echoes
 * one puts the literal text `[[BLOCK-0]]` into an article's description,
 * which is printed on the public site and shared to social — a failure that
 * is invisible in the editor and obvious to everyone else.
 *
 * So the blocks are dropped rather than marked. A summary of the words is
 * still a summary.
 */
export function proseOnly(content: PayloadContent): string {
  return (content.root.children ?? [])
    .filter((node) => REWRITABLE.has(node.type))
    .map(blockToText)
    .filter((text) => text.trim())
    .join("\n\n");
}

/* ------------------------------------------------------------------ */
/* text -> document                                                     */
/* ------------------------------------------------------------------ */

const textNode = (text: string, format = 0): JsonNode => ({
  type: "text",
  text,
  format,
  style: "",
  mode: "normal",
  detail: 0,
  version: 1,
});

const container = (type: string, children: JsonNode[], extra: object = {}): JsonNode => ({
  type,
  format: "",
  indent: 0,
  version: 1,
  direction: "ltr",
  children,
  ...extra,
});

/** `**bold**`, `*italic*`, `~~strike~~`, `` `code` `` and `[text](url)`. */
function parseInline(line: string): JsonNode[] {
  const out: JsonNode[] = [];
  // One pass, longest markers first so `**` is never read as two `*`.
  const pattern =
    /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`(.+?)`|\[([^\]]+)\]\(([^)\s]+)\)/;

  let rest = line;
  while (rest) {
    const match = pattern.exec(rest);
    if (!match) {
      out.push(textNode(rest));
      break;
    }
    if (match.index > 0) out.push(textNode(rest.slice(0, match.index)));

    const [, boldItalic, bold, italic, strike, code, linkText, linkUrl] = match;
    if (boldItalic !== undefined) {
      out.push(textNode(boldItalic, FORMAT_BOLD | FORMAT_ITALIC));
    } else if (bold !== undefined) {
      out.push(textNode(bold, FORMAT_BOLD));
    } else if (italic !== undefined) {
      out.push(textNode(italic, FORMAT_ITALIC));
    } else if (strike !== undefined) {
      out.push(textNode(strike, FORMAT_STRIKETHROUGH));
    } else if (code !== undefined) {
      out.push(textNode(code, FORMAT_CODE));
    } else {
      out.push(
        container(
          "link",
          [textNode(linkText)],
          {
            version: 3,
            fields: { linkType: "custom", newTab: false, url: linkUrl },
          },
        ),
      );
    }
    rest = rest.slice(match.index + match[0].length);
  }

  return out.length ? out : [textNode("")];
}

/** Inline content that may span several lines, joined by line breaks. */
function parseInlineLines(lines: string[]): JsonNode[] {
  const out: JsonNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push({ type: "linebreak", version: 1 });
    out.push(...parseInline(line));
  });
  return out;
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*(#{1,6})\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

function listNode(items: string[], ordered: boolean): JsonNode {
  return container(
    "list",
    items.map((item, i) =>
      container("listitem", parseInline(item), { value: i + 1 }),
    ),
    { listType: ordered ? "number" : "bullet", tag: ordered ? "ol" : "ul", start: 1 },
  );
}

/**
 * Rebuild a document from the model's reply, putting each opaque node back
 * where its marker landed.
 *
 * The blank-line split is what makes markers positional: the prompt asks for
 * each marker on a line of its own, and a marker sharing a paragraph with
 * prose is still recognised — the line is lifted out and the prose either
 * side of it kept.
 */
export function fromAIText(text: string, blocks: MarkedDocument["blocks"]): PayloadContent {
  const restored = new Set<number>();
  const out: JsonNode[] = [];

  const flushList = (items: string[], ordered: boolean) => {
    if (items.length) out.push(listNode(items, ordered));
  };

  for (const chunk of text.split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((line) => line.trim() !== "");
    if (!lines.length) continue;

    let paragraph: string[] = [];
    let bullets: string[] = [];
    let numbers: string[] = [];

    const flushParagraph = () => {
      if (paragraph.length) out.push(container("paragraph", parseInlineLines(paragraph)));
      paragraph = [];
    };
    const flushAll = () => {
      flushParagraph();
      flushList(bullets, false);
      bullets = [];
      flushList(numbers, true);
      numbers = [];
    };

    for (const line of lines) {
      const markerMatch = MARKER_LINE.exec(line);
      if (markerMatch) {
        flushAll();
        const index = Number(markerMatch[1]);
        // An index the model invented, or one it repeated. Neither can be
        // honoured — there is no second copy of the node to place — and
        // both are silent no-ops rather than errors, because the member's
        // document is not the place to report a model's arithmetic.
        if (blocks[index] && !restored.has(index)) {
          restored.add(index);
          out.push(blocks[index].node);
        }
        continue;
      }

      const heading = HEADING.exec(line);
      if (heading) {
        flushAll();
        out.push(
          container("heading", parseInline(heading[2]), {
            tag: `h${heading[1].length}`,
          }),
        );
        continue;
      }

      const quote = QUOTE.exec(line);
      if (quote) {
        flushAll();
        out.push(container("quote", parseInline(quote[1])));
        continue;
      }

      const bullet = BULLET.exec(line);
      if (bullet) {
        flushParagraph();
        flushList(numbers, true);
        numbers = [];
        bullets.push(bullet[1]);
        continue;
      }

      const ordered = ORDERED.exec(line);
      if (ordered) {
        flushParagraph();
        flushList(bullets, false);
        bullets = [];
        numbers.push(ordered[1]);
        continue;
      }

      flushList(bullets, false);
      bullets = [];
      flushList(numbers, true);
      numbers = [];
      paragraph.push(line);
    }

    flushAll();
  }

  // The checklist. Ascending original index, each placed at the position it
  // held in the document the member wrote — which is the closest thing to
  // "where it belongs" that survives a rewrite of everything around it.
  blocks.forEach((block, index) => {
    if (restored.has(index)) return;
    out.splice(Math.min(block.index, out.length), 0, block.node);
  });

  return {
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction: "ltr",
      children: out,
    },
  };
}
