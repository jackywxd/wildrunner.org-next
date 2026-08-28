import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import config from "../../tailwind.config";

/**
 * U-FONTUTIL — every `font-*` class the site writes is a class that exists.
 *
 * `font-heading` was written in twenty-odd components and defined nowhere.
 * Tailwind does not complain about an unknown utility — it just does not
 * emit one — so each of those call sites asked for the heading face and
 * silently kept whatever it inherited. Nothing on screen says "this class
 * did nothing"; the text simply looks like the text next to it, which is
 * exactly what a heading is not supposed to do.
 *
 * That is the second time this shape has cost a day here. The public post
 * page carried `prose prose-neutral dark:prose-invert` for the life of the
 * repository while `@tailwindcss/typography` was never a dependency, and
 * the whole of an article's typography was missing because of it. Both were
 * invisible to a suite that asks whether text is present.
 *
 * So this reads the source rather than the screen: gather the `font-*`
 * classes written under `src/`, and require each to be a key of the config's
 * `fontFamily` or one of Tailwind's own. It cannot see a class built at
 * runtime from a template literal, and does not pretend to — it catches the
 * literal ones, which is all of them today.
 */

/** Tailwind's own `font-*` utilities, which need no config entry. */
const BUILT_IN = new Set([
  // theme("fontFamily") defaults
  "sans",
  "serif",
  "mono",
  // font-weight
  "thin",
  "extralight",
  "light",
  "normal",
  "medium",
  "semibold",
  "bold",
  "extrabold",
  "black",
  // font-style and font-variant-numeric
  "italic",
  "not-italic",
  "normal-nums",
  "ordinal",
  "slashed-zero",
  "lining-nums",
  "oldstyle-nums",
  "proportional-nums",
  "tabular-nums",
  "diagonal-fractions",
  "stacked-fractions",
]);

/**
 * CSS longhands that read as `font-*` but are properties, not classes.
 *
 * They turn up in string literals for real reasons — the MDX importer's
 * sanitiser allows `font-family` in an inline style — and Tailwind has a
 * utility for none of them (its font sizes are `text-*`), so anything here
 * is unambiguously CSS.
 */
const CSS_PROPERTIES = new Set([
  "family",
  "size",
  "weight",
  "style",
  "stretch",
  "variant",
  "feature-settings",
  "variation-settings",
  "display",
  "kerning",
  "synthesis",
  "optical-sizing",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

test.describe("U-FONTUTIL font classes exist", () => {
  test("U-FONTUTIL-1: every font-* class written under src/ is one Tailwind emits", () => {
    const declared = new Set(Object.keys(config.theme?.extend?.fontFamily ?? {}));
    const used = new Map<string, string>();

    for (const file of sourceFiles("src")) {
      const source = readFileSync(file, "utf8");
      // Inside string literals only, so prose in a comment — "the
      // font-heading utility" — is not read as a call site. The lookbehind
      // rejects a leading dash, which is what keeps `--font-archivo` (a
      // custom property, not a class) out of the results.
      for (const literal of source.match(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g) ?? []) {
        for (const match of literal.matchAll(/(?<![\w-])font-([a-z][a-z0-9-]*)(?![\w-])/g)) {
          if (!CSS_PROPERTIES.has(match[1]) && !used.has(match[1])) {
            used.set(match[1], file);
          }
        }
      }
    }

    expect(used.size, "no font-* classes found — the scan is broken").toBeGreaterThan(0);

    const missing = [...used]
      .filter(([name]) => !declared.has(name) && !BUILT_IN.has(name))
      .map(([name, file]) => `font-${name} (${file})`);

    // If this fails, the class is either a typo or a face nobody added to
    // tailwind.config.ts. Do not add it to BUILT_IN to make it pass — that
    // list is Tailwind's, not ours.
    expect(missing).toEqual([]);
  });

  test("U-FONTUTIL-2: each face the config declares resolves to a variable something defines", () => {
    const faces = config.theme?.extend?.fontFamily ?? {};
    // Two places define these, and both count: the stylesheet composes
    // `--font-heading` and `--font-body`, while next/font generates
    // `--font-archivo`, `--font-noto` and `--font-code` from the `variable`
    // option in the layout.
    const definitions =
      readFileSync("src/styles/globals.css", "utf8") +
      readFileSync("src/app/(site)/layout.tsx", "utf8");

    for (const [name, stack] of Object.entries(faces)) {
      const first = (stack as string[])[0];
      const variable = /var\((--[a-z-]+)\)/.exec(first)?.[1];
      // A face whose first entry is a plain family name needs no variable.
      if (!variable) continue;
      // The other half of the bug: a utility that exists but points at a
      // custom property nothing defines is exactly as silent as a class
      // that does not exist.
      const defined =
        definitions.includes(`${variable}:`) ||
        definitions.includes(`"${variable}"`);
      expect(defined, `${name} → ${first} — nothing defines ${variable}`).toBe(true);
    }
  });
});
