import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";

import { readFrontmatter } from "./frontmatter";
import { normalizeMdx } from "./normalize";
import { mdastToLexical } from "./to-lexical";
import type { ImportResult, ImportWarning } from "./types";

type MdastNode = {
  children?: MdastNode[];
  depth?: number;
  type: string;
  value?: string;
  [key: string]: unknown;
};

const IDEOGRAPHIC_SPACE = "　";
const DESCRIPTION_MAX_LENGTH = 120;
const MAX_SLUG_LENGTH = 60;

/**
 * Same ASCII-only algorithm as `derivePostSlug` in
 * `src/collections/hooks/derive-slug.ts` — that hook is server-only (it
 * queries the database to resolve collisions, which this client-side
 * converter has no way to do), so this is a deliberate, small duplication
 * rather than a shared import. Keep the two in sync if either changes.
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

function plainText(nodes: MdastNode[]): string {
  let text = "";
  for (const node of nodes) {
    if (node.type === "text" || node.type === "inlineCode") {
      text += node.value ?? "";
    } else if (node.type === "break") {
      text += " ";
    } else if (node.children) {
      text += plainText(node.children);
    }
  }
  return text;
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function parseDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Parses a pasted or uploaded markdown/MDX document into everything needed
 * to start a draft post: derived title/slug/description, the Lexical
 * `content` value, and a warning for every piece of the source this
 * converter could not carry across losslessly.
 *
 * Pure and synchronous — no network, no clock beyond `new Date(frontmatter
 * date)`, no DOM. Runs entirely on data the caller already has in memory,
 * which is what makes it cheap to unit test at the level
 * `docs/testing-strategy.md` asks for (see `e2e/unit/mdx-import.spec.ts`)
 * instead of needing a browser.
 *
 * Only `.parse()` is called on the unified processor, never `.run()` — every
 * plugin registered here (`remark-parse`, `remark-gfm`,
 * `remark-frontmatter`) is a parser-stage extension, not a tree transformer,
 * so there is nothing for `.run()` to do and staying synchronous keeps this
 * function free of the `async` that would otherwise leak into the caller's
 * UI state machine.
 */
export function importMarkdown(source: string): ImportResult {
  const warnings: ImportWarning[] = [];

  const normalized = normalizeMdx(source);
  warnings.push(...normalized.warnings);

  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]);
  const tree = processor.parse(normalized.text) as unknown as MdastNode;
  const topLevel = tree.children ?? [];

  const yamlNode = topLevel.find((node) => node.type === "yaml");
  const frontmatter = readFrontmatter(yamlNode?.value ?? "");
  warnings.push(...frontmatter.warnings);

  let body = topLevel.filter((node) => node.type !== "yaml");

  let title = frontmatter.fields.title ?? "";
  const leading = body[0];
  if (title === "" && leading?.type === "heading" && leading.depth === 1) {
    title = plainText(leading.children ?? []).trim();
    body = body.slice(1);
  }

  const firstParagraph = body.find((node) => node.type === "paragraph");
  const derivedDescription = firstParagraph
    ? truncate(plainText(firstParagraph.children ?? []), DESCRIPTION_MAX_LENGTH)
    : "";
  const description = frontmatter.fields.description || derivedDescription || IDEOGRAPHIC_SPACE;

  const content = mdastToLexical({ type: "root", children: body }, warnings);

  return {
    content,
    description,
    publishedAt: parseDate(frontmatter.fields.date),
    slug: slugify(title),
    title,
    warnings,
  };
}
