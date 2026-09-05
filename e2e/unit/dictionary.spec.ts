import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Read rather than imported. The unit lane runs as ESM, where a JSON import
 * needs `with { type: "json" }` — and adding that here would make this file
 * disagree with `dictionary.ts`, which imports the same file the way Next
 * does. Reading it keeps the test's view of the dictionary identical to the
 * file on disk, which is what it is actually asserting about.
 */
const dictionary: unknown = JSON.parse(
  readFileSync("src/dictionaries/zh-Hant.json", "utf8"),
);

/**
 * U-DICT — the dictionary and the code that reads it stay in step.
 *
 * A dictionary rots in two directions and neither shows up on screen in a way
 * anybody notices. A key the code reads and the file does not have renders
 * `undefined` — a real word, four characters wide, in the middle of a
 * sentence. A key the file has and nothing reads is a phrase that will be
 * translated into three languages and displayed nowhere.
 *
 * This is a unit test on purpose: it reads files, not a server, and it is the
 * only check here that can see the *absence* of something. The route sweep
 * (`X-I18N-1`) proves the pages still render; it cannot prove a key nobody
 * used is gone, because nothing renders it.
 */

const SRC = "src";

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/** Every `a.b` path in the dictionary, as the code would write it. */
function paths(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    return [prefix];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    paths(value, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * Comments are stripped first, because both checks below read this text as if
 * it were code. A sentence in `components/media/filters.tsx` mentioning
 * `t.gallery.kind*` made U-DICT-2 report `gallery.kind` as a key read but not
 * defined — the prose describing the change, flagged as the change's bug.
 * `scripts/assert-test-strategy.mjs` carries the same guard and the same
 * reason. U-DICT-1 needs it just as much in the other direction: a key
 * mentioned only in a comment would count as used.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const code = sources(SRC)
  .filter((path) => !path.endsWith("dictionaries/zh-Hant.json"))
  .map((path) => stripComments(readFileSync(path, "utf8")))
  .join("\n");

test.describe("U-DICT the dictionary and its readers agree", () => {
  test("U-DICT-3: every language carries exactly the same keys", () => {
    // The check that a language cannot ship half-written. TypeScript will not
    // catch it: `Dictionary` is `typeof import(zh-Hant.json)` and the others
    // are read through a dynamic import, so a missing key becomes `undefined`
    // at runtime — a real word, nine characters wide, in the middle of a
    // sentence — and an extra one is a phrase nothing renders.
    //
    // Order is compared too, not just the set. It is not load-bearing, but a
    // reviewer reading two dictionaries side by side is the only person who
    // can catch a translation that is fluent and wrong, and that job is much
    // harder when the files do not line up.
    const reference = paths(dictionary);
    for (const file of ["zh-Hans"]) {
      const other = paths(
        JSON.parse(readFileSync(`src/dictionaries/${file}.json`, "utf8")),
      );
      expect(other, `${file}.json does not match zh-Hant.json`).toEqual(reference);
    }
  });

  test("U-DICT-1: every key the dictionary holds is read by something", () => {
    // `t.reader.pause` in the source, or `t.reader[option.labelKey]` for the
    // handful of module-level option lists — those are matched by their
    // section, since the leaf is chosen at runtime.
    const unused = paths(dictionary).filter((path) => {
      const [section, leaf] = path.split(".");
      return (
        !code.includes(`t.${path}`) &&
        !code.includes(`t.${section}[`) &&
        !(leaf && code.includes(`"${leaf}"`) && code.includes(`t.${section}[`))
      );
    });
    expect(unused, `unused dictionary keys:\n${unused.join("\n")}`).toEqual([]);
  });

  test("U-DICT-2: every key the code reads exists in the dictionary", () => {
    const known = new Set(paths(dictionary));
    const sections = new Set(paths(dictionary).map((path) => path.split(".")[0]));
    const missing = [...code.matchAll(/\bt\.([a-zA-Z]+)\.([a-zA-Z]+)/g)]
      .map((match) => `${match[1]}.${match[2]}`)
      .filter((path) => sections.has(path.split(".")[0]) && !known.has(path));
    expect(
      [...new Set(missing)],
      `keys read but not defined:\n${[...new Set(missing)].join("\n")}`,
    ).toEqual([]);
  });
});
