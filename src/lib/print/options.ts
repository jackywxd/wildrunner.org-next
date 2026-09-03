/**
 * What a printed article looks like, decided from two query parameters.
 *
 * THE THREE TEMPLATES ARE THREE ANSWERS TO "why are you printing this", not
 * three skins. That is the whole design and it is what makes them worth
 * having separately:
 *
 *   - `standard` — to read. Everything, at a size you finish an article in.
 *   - `magazine` — to keep. Cover photo across the page, serif, set larger.
 *   - `compact`  — to spend the least paper. Two columns, small, NO PHOTOS.
 *
 * On the seeded corpus's longest article that is roughly 9, 13 and 3 sheets.
 * Dropping the photographs is what makes the third one worth a menu entry;
 * without that it would be `standard` at 90%.
 *
 * Pure and taking plain strings, so every rule here is exercised by the unit
 * lane with no route, no database and no browser.
 */
import type { Post } from "@/payload-types";

export type PrintTemplate = "standard" | "magazine" | "compact";
export type PrintFont = "sans" | "serif";

export type PrintOptions = { template: PrintTemplate; font: PrintFont };

const TEMPLATES: PrintTemplate[] = ["standard", "magazine", "compact"];
const FONTS: PrintFont[] = ["sans", "serif"];

/**
 * Each template's own idea of what it should be set in.
 *
 * A magazine spread is serif because it is read at length and kept; the other
 * two are the site's own face. `font` overrides this — the two menus are
 * independent, and somebody who wants a serif compact print may have one.
 */
const DEFAULT_FONT: Record<PrintTemplate, PrintFont> = {
  standard: "sans",
  magazine: "serif",
  compact: "sans",
};

/**
 * AN UNKNOWN VALUE FALLS BACK, it never errors.
 *
 * Same rule as `/api/gallery/wall`'s `parseArrangement`, and for the same
 * reason: a query string is not a contract anybody signed. A stale bookmark,
 * a hand-typed URL or a template we later rename must still print the
 * article rather than show a stack trace — the page's job is the article.
 */
export function parsePrintOptions(raw: {
  template?: string | string[] | null;
  font?: string | string[] | null;
}): PrintOptions {
  const first = (value: string | string[] | null | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const wanted = first(raw.template) as PrintTemplate | undefined;
  const template = wanted && TEMPLATES.includes(wanted) ? wanted : "standard";

  const wantedFont = first(raw.font) as PrintFont | undefined;
  const font =
    wantedFont && FONTS.includes(wantedFont)
      ? wantedFont
      : DEFAULT_FONT[template];

  return { font, template };
}

/** Whether this template puts photographs on paper at all. */
export function printsPhotos(template: PrintTemplate): boolean {
  return template !== "compact";
}

/**
 * The article body with its images taken out.
 *
 * `display: none` was the obvious alternative and it is the wrong one: a
 * hidden `next/image` is still fetched, so a compact print would download
 * every photograph in the article — on the seeded corpus that is 111 uploads
 * across 15 posts — to render none of them. Removing the nodes means the
 * request is never made.
 *
 * Rebuilt rather than mutated: the value comes from a cached query and is
 * shared with whatever else renders that post in the same request.
 *
 * An upload node carries no `children` — measured over all 111 of them while
 * building the reader — so dropping one can never orphan text.
 */
export function withoutUploads(
  content: Post["content"] | undefined,
): Post["content"] | undefined {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node
        .filter(
          (child) =>
            !(
              child &&
              typeof child === "object" &&
              (child as { type?: string }).type === "upload"
            ),
        )
        .map(strip);
    }
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) out[key] = strip(value);
      return out;
    }
    return node;
  };

  if (!content) return content;
  return strip(content) as Post["content"];
}
