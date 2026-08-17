import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

import type { ImportWarning } from "./types";
import type { Schema } from "hast-util-sanitize";

/**
 * Renders a block of raw HTML/SVG a member pasted, sanitized, on the public
 * post page (`payload-rich-text.tsx`'s `blocks.HtmlEmbed` converter). This
 * is real `dangerouslySetInnerHTML`, so what this function lets through is
 * what every anonymous visitor's browser executes — the sanitizer, not the
 * member, decides what is safe.
 *
 * Trust model: `create` on `Posts` is `isAuthenticated` — any signed-in
 * member, not a vetted tier — and a post they publish is public. So the
 * input side is "any member account, possibly compromised", not "arbitrary
 * anonymous internet input"; that is genuinely a smaller threat surface
 * than a public submission form. It is not zero, since the *output* side
 * (who reads a published post) is the whole public. The allowlist below is
 * built for that: no `<script>`, no event-handler attributes (`onload`,
 * `onerror`, …), no `<foreignObject>` (the standard way to smuggle HTML —
 * and scripts — inside an otherwise-inert SVG), no `<iframe>`/`<object>`/
 * `<embed>`. Everything not explicitly listed is dropped, not merely
 * escaped — `hast-util-sanitize` is allowlist-based, so a tag or attribute
 * this file never mentions cannot reach the page no matter what a future
 * MDX document contains.
 *
 * Sanitizing once, at import time, rather than again at render time, is a
 * real, accepted gap: a future bug in this file's schema would affect
 * every post already imported through it, not just new ones. Re-sanitizing
 * in `payload-rich-text.tsx` on every render would close that gap; it is
 * not done here to keep this change scoped to the import path, and is
 * worth adding if this feature sees real use.
 */

const JSX_TO_SVG_ATTR: Record<string, string> = {
  className: "class",
  textAnchor: "text-anchor",
  dominantBaseline: "dominant-baseline",
  fontFamily: "font-family",
  fontSize: "font-size",
  fontWeight: "font-weight",
  fontStyle: "font-style",
  letterSpacing: "letter-spacing",
  fillOpacity: "fill-opacity",
  fillRule: "fill-rule",
  strokeWidth: "stroke-width",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeOpacity: "stroke-opacity",
  strokeMiterlimit: "stroke-miterlimit",
  clipRule: "clip-rule",
  clipPath: "clip-path",
  stopColor: "stop-color",
  stopOpacity: "stop-opacity",
  textDecoration: "text-decoration",
  vectorEffect: "vector-effect",
};

/**
 * `<style>{`...`}</style>` — a template-literal-in-braces wrapper, the
 * common MDX/styled-jsx-ish way to author a `<style>` tag — unwrapped to
 * plain `<style>...</style>` before parsing. `remark-parse` has no MDX
 * awareness (verified: this whole block arrives as one opaque `html` mdast
 * node — see `to-lexical.ts`), so nothing upstream has interpreted the
 * `{`...`}` as a JS expression; it is still literal text here.
 */
const STYLE_TEMPLATE_LITERAL = /<style>\{`([\s\S]*?)`\}<\/style>/g;

/**
 * JSX attribute names, rewritten to their real HTML/SVG equivalents.
 *
 * Deliberately an explicit table, not a blanket camelCase-to-kebab-case
 * conversion: several real SVG attributes are *already* mixed-case
 * (`viewBox`, `preserveAspectRatio`, `patternUnits`, `gradientUnits`,
 * `markerUnits`, `clipPathUnits`, `spreadMethod`) — kebab-casing those
 * would break them (`viewBox` → `view-box` is not an SVG attribute).
 * Anything not in this table is passed through unchanged; if that leaves a
 * genuine JSX-only attribute name in the markup, the sanitizer's allowlist
 * drops it for not being a real attribute — a safe failure, not a silent
 * miss.
 */
function normalizeJsxAttributes(html: string): string {
  let out = html;
  for (const [jsxName, realName] of Object.entries(JSX_TO_SVG_ATTR)) {
    out = out.replaceAll(
      new RegExp(`\\b${jsxName}=`, "g"),
      `${realName}=`,
    );
  }
  return out;
}

const HTML_EMBED_SCHEMA: Schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "style",
    "figure",
    "figcaption",
    "svg",
    "g",
    "defs",
    "title",
    "path",
    "rect",
    "line",
    "circle",
    "ellipse",
    "polygon",
    "polyline",
    "text",
    "tspan",
    "linearGradient",
    "radialGradient",
    "stop",
  ],
  attributes: {
    ...defaultSchema.attributes,
    // `className`, not `class`: hast represents the HTML `class` attribute
    // internally as the `className` property (confirmed against the
    // default schema's own per-tag entries, e.g. `code: [['className', …]]`)
    // — a schema entry literally named `class` matches nothing and is
    // silently a no-op, which is how the first version of this schema lost
    // every `class` attribute without erroring.
    //
    // Deliberately no inline `style` attribute: `hast-util-sanitize` does
    // not parse or restrict a `style` attribute's *value*, only whether the
    // attribute is present at all — measured directly, `style="background:
    // url(javascript:alert(1))"` passed through unchanged. Modern browsers
    // no longer execute `javascript:` from CSS `url()`, but nothing in the
    // charts this feature targets uses inline `style=` (they use `class` +
    // a `<style>` block), so there is no reason to keep the door open.
    //
    // `text-anchor`/`font-size`/etc. are listed both as `rehype-parse`
    // normalizes them (`textAnchor`, camelCase) *and* as their literal
    // attribute name — measured directly: `property-information` only
    // recognizes SVG presentation attributes and maps them to a camelCase
    // hast property when the element sits inside an `<svg>` ancestor in
    // the parsed tree; a `<text>` that ends up without one (malformed
    // input, or a sanitizer schema check exercised in isolation) keeps the
    // literal hyphenated name unconverted. The real content this feature
    // targets always nests correctly, but there is no reason for a
    // structural accident elsewhere in the tree to silently drop an
    // attribute rather than just also matching its unconverted form.
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "fill", "stroke"],
    svg: ["viewBox", "width", "height", "role", "ariaLabel", "xmlns"],
    text: ["x", "y", "textAnchor", "text-anchor", "fontSize", "font-size", "fontWeight", "font-weight"],
    tspan: ["x", "y", "dx", "dy"],
    path: ["d"],
    rect: ["x", "y", "width", "height", "rx", "ry"],
    line: ["x1", "y1", "x2", "y2"],
    circle: ["cx", "cy", "r"],
    ellipse: ["cx", "cy", "rx", "ry"],
    polygon: ["points"],
    polyline: ["points"],
    linearGradient: ["id", "x1", "y1", "x2", "y2", "gradientUnits"],
    radialGradient: ["id", "cx", "cy", "r", "gradientUnits"],
    stop: ["offset", "stopColor", "stopOpacity"],
    g: ["transform"],
  },
};

export function sanitizeEmbeddedHtml(
  raw: string,
): { html: string; warnings: ImportWarning[] } {
  const unwrapped = raw.replace(STYLE_TEMPLATE_LITERAL, "<style>$1</style>");
  const normalized = normalizeJsxAttributes(unwrapped);

  const processor = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeSanitize, HTML_EMBED_SCHEMA)
    .use(rehypeStringify);

  const html = String(processor.processSync(normalized));

  const warnings: ImportWarning[] = [
    {
      code: "html-embedded",
      message:
        "這段 HTML/SVG 內容已經過安全過濾並保留，會在公開頁面渲染，但目前無法在編輯器內修改",
    },
  ];

  return { html, warnings };
}
