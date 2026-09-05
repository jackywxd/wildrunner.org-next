import { readFileSync, writeFileSync } from "node:fs";

import { toSimplified } from "./lib/zh-convert";

/**
 * `src/dictionaries/zh-Hans.json`, from `zh-Hant.json`, by conversion.
 *
 * WHY THE OUTPUT IS COMMITTED rather than generated during the build. The
 * converter carries 6.1MB of dictionaries and the build has no business
 * loading them; more than that, a generated file that nobody can read in a
 * diff is a file nobody reviews. Committing it means the Simplified wording
 * arrives in a pull request as text, which is the only place a person can
 * catch a word that converted correctly and still reads wrong.
 *
 * `U-CONVERT-3` re-runs this in memory and fails if the committed file is not
 * what it would produce, so the two cannot drift.
 *
 * WHAT IS NOT CONVERTED. Keys, and anything with no Han characters in it —
 * `{count}` placeholders and `PDF` pass through because the converter leaves
 * them alone, not because this walks around them.
 */

const SOURCE = "src/dictionaries/zh-Hant.json";
const TARGET = "src/dictionaries/zh-Hans.json";

type Json = string | Json[] | { [key: string]: Json };

function convert(node: Json): Json {
  if (typeof node === "string") return toSimplified(node);
  if (Array.isArray(node)) return node.map(convert);
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, convert(value)]),
  );
}

export function generate(source: string): string {
  return `${JSON.stringify(convert(JSON.parse(source) as Json), null, 2)}\n`;
}

function main() {
  const generated = generate(readFileSync(SOURCE, "utf8"));
  const current = (() => {
    try {
      return readFileSync(TARGET, "utf8");
    } catch {
      return null;
    }
  })();

  if (current === generated) {
    console.log(`${TARGET} is already up to date.`);
    return;
  }
  writeFileSync(TARGET, generated);
  console.log(`${TARGET} ${current === null ? "created" : "updated"}.`);
}

// Guarded so `U-CONVERT-3` can import `generate` without writing the file.
if (process.argv[1]?.endsWith("generate-zh-hans.ts")) {
  main();
  // scripts/ files exit explicitly — see AGENTS.md.
  process.exit(0);
}
