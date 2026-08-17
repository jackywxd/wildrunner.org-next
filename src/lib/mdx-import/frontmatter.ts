import type { ImportWarning } from "./types";

/**
 * Reads the three scalar keys this importer cares about out of a YAML
 * frontmatter block, without a YAML parser.
 *
 * No YAML dependency is available in this repo (`yaml`, `js-yaml`,
 * `gray-matter` are all unresolvable — not even transitively present), and
 * pulling in a full parser to read `title:` is not worth ~40KB in a lazy
 * chunk. `remark-frontmatter` already isolates the block as a single `yaml`
 * mdast node (see `to-lexical.ts`); this only has to read scalar lines out
 * of its raw text.
 *
 * Deliberately narrow: only top-level (zero-indent) `key: value` lines are
 * read. A value that looks like a YAML block/flow form (starts with `|`,
 * `>`, `[`, `{`, or is followed by an indented continuation) is not
 * something this reader can interpret correctly, so it is reported as a
 * warning instead of silently mangled — the member seeing `|` as their
 * title would have no way to tell where it came from.
 */

const SCALAR_LINE = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/;
const BLOCK_FORM_START = /^[|>[{]/;

const TITLE_KEYS = ["title"];
const DESCRIPTION_KEYS = ["description", "summary", "excerpt"];
const DATE_KEYS = ["date", "publishedAt"];

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

export type FrontmatterFields = {
  date: string | null;
  description: string | null;
  title: string | null;
};

export function readFrontmatter(raw: string): {
  fields: FrontmatterFields;
  warnings: ImportWarning[];
} {
  const warnings: ImportWarning[] = [];
  const scalars = new Map<string, string>();
  const lines = raw.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s/.test(line)) continue; // not zero-indent — part of a prior block form
    const match = SCALAR_LINE.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trim();
    const nextLine = lines[i + 1] ?? "";
    const nextIsIndented = /^[ \t]+\S/.test(nextLine);

    if (value === "" || BLOCK_FORM_START.test(value) || nextIsIndented) {
      if ([...TITLE_KEYS, ...DESCRIPTION_KEYS, ...DATE_KEYS].includes(key)) {
        warnings.push({
          code: "frontmatter-unparsed",
          message: `frontmatter 的 "${key}" 使用區塊或集合形式，未讀取，請手動填寫`,
          detail: line,
        });
      }
      continue;
    }

    scalars.set(key, unquote(value));
  }

  const pick = (keys: string[]) => {
    for (const key of keys) {
      const value = scalars.get(key);
      if (value) return value;
    }
    return null;
  };

  return {
    fields: {
      date: pick(DATE_KEYS),
      description: pick(DESCRIPTION_KEYS),
      title: pick(TITLE_KEYS),
    },
    warnings,
  };
}
