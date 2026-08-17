import type { ImportWarning } from "./types";

/**
 * String-level rewrites that have to happen before `remark-parse` ever sees
 * the source, because `remark-parse` is not MDX-aware: it treats
 * `<YouTube id="x"/>`, `import`/`export` statements, and any other JSX as
 * opaque `html` nodes (verified by dumping the real mdast tree), not as
 * structure it could otherwise convert.
 *
 * Rules are the same ones `normalizeMdx` in
 * `scripts/migrate-velite-to-payload.ts` already proved out against the
 * real corpus, extended here so each rewrite reports itself — the migration
 * script runs once, unattended; this runs in front of a member who needs to
 * know what changed.
 *
 * Fence-aware: normalization only touches text outside fenced code blocks.
 * Without that, a code sample containing `import x from "y"` would lose the
 * line, and `<Foo/>` inside a JSX code sample would be rewritten as if it
 * were real markup.
 */

const YOUTUBE = /<YouTube\s+id=["']([^"']+)["']\s*\/>/g;
const IMPORT_EXPORT_LINE = /^[ \t]*(?:import|export)\s.+$/gm;
const JSX_SELF_CLOSING = /<([A-Z][A-Za-z0-9]*)[^>]*\/>/g;
const FENCE_LINE = /^[ \t]*(```|~~~)/;

/** Splits source into alternating non-fenced / fenced segments. */
function splitOnFences(source: string): { fenced: boolean; text: string }[] {
  const lines = source.split("\n");
  const segments: { fenced: boolean; text: string }[] = [];
  let current: string[] = [];
  let fenced = false;
  let fenceMarker = "";

  for (const line of lines) {
    const match = FENCE_LINE.exec(line);
    if (!fenced && match) {
      if (current.length > 0) segments.push({ fenced: false, text: current.join("\n") });
      current = [line];
      fenced = true;
      fenceMarker = match[1];
    } else if (fenced && match && match[1] === fenceMarker) {
      current.push(line);
      segments.push({ fenced: true, text: current.join("\n") });
      current = [];
      fenced = false;
      fenceMarker = "";
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) segments.push({ fenced, text: current.join("\n") });
  return segments;
}

export function normalizeMdx(source: string): { text: string; warnings: ImportWarning[] } {
  const warnings: ImportWarning[] = [];

  const rewritten = splitOnFences(source)
    .map((segment) => {
      if (segment.fenced) return segment.text;

      let text = segment.text;

      text = text.replace(YOUTUBE, (_full, id: string) => `\n\nhttps://www.youtube.com/watch?v=${id}\n\n`);

      text = text.replace(IMPORT_EXPORT_LINE, (line) => {
        warnings.push({
          code: "unsupported-syntax",
          message: "已移除一行 import/export 陳述式",
          detail: line.trim(),
        });
        return "";
      });

      text = text.replace(JSX_SELF_CLOSING, (full, name: string) => {
        warnings.push({
          code: "unsupported-component",
          message: `不支援的元件「${name}」已改為文字佔位`,
          detail: full,
        });
        return `[不支援的元件: ${name}]`;
      });

      return text;
    })
    .join("\n");

  return { text: rewritten, warnings };
}
