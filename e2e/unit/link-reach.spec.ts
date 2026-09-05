import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * U-LINKREACH — nothing reaches `next/link` except the three that should.
 *
 * THE BUG THIS MAKES UNREPEATABLE. `/zh-hans` lasted one click: every
 * internal link in the app was the unprefixed address, and `next.config.ts`
 * rewrites unprefixed to the default locale, so the first thing a Simplified
 * reader clicked returned them to Traditional. Forty-one files imported
 * `next/link` directly and not one of them carried the reader's language.
 *
 * WHY A CHECK AND NOT A CONVENTION. The failure is silent by construction:
 * a page that forgets renders perfectly, links correctly, and only sends the
 * reader somewhere they did not ask to go — in a language most reviewers of
 * this repo do not read. Nothing in the type system, the linter or a browser
 * test of that page can see it. A list of what is allowed to import
 * `next/link`, and a failure naming everything else, can.
 *
 * `LocaleLink` PASSES A LOCALE-NAMED HREF THROUGH UNCHANGED, so the three
 * exemptions below are about intent rather than about correctness.
 */

const SRC = "src";

/**
 * The only files allowed to import `next/link`, and why each one is.
 *
 * A fourth entry is a decision, not a formality: it means somebody has a
 * reason a link there must not carry the reader's language, and the reason
 * belongs here next to it.
 */
const ALLOWED: readonly (readonly [string, string])[] = [
  [
    "src/components/i18n/locale-link.tsx",
    "the wrapper itself — it is what everything else imports instead",
  ],
  [
    "src/components/i18n/language-switcher.tsx",
    "it names OTHER languages on purpose; `LocaleLink` means 'stay in this one'",
  ],
  [
    "src/app/not-found.tsx",
    "the root 404, outside `[lang]` — there is no reader language to carry",
  ],
  [
    "src/components/transition/react-transition-progress/next.tsx",
    "the other wrapper — it preventDefaults and calls `router.push` itself, " +
      "so it applies `localeHref` to the pushed address as well as the " +
      "rendered one, which `LocaleLink` underneath could not do for it",
  ],
];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/**
 * Comments go first. This repo has shipped three checkers that read their own
 * explanatory comment as code — `U-DICT`, `U-DICTREACH` and
 * `assert-test-strategy.mjs` all carry this same guard, and this file's own
 * header mentions `next/link` several times.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test.describe("U-LINKREACH every link carries the reader's language", () => {
  test("U-LINKREACH-1: only the listed files import next/link", () => {
    const allowed = new Set(ALLOWED.map(([path]) => path));
    const offenders = sources(SRC)
      .filter((path) => !allowed.has(path))
      .filter((path) =>
        /from\s+["']next\/link["']/.test(stripComments(readFileSync(path, "utf8"))),
      );

    expect(
      offenders,
      `these import next/link directly, so their links drop the reader's ` +
        `language — use \`LocaleLink\` instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  test("U-LINKREACH-2: every exemption still exists and still needs to be one", () => {
    // An exemption for a file that was deleted or has stopped importing
    // `next/link` is a licence nobody is using, and the next person to add a
    // file reads the list as a description of what is normal.
    const stale = ALLOWED.filter(
      ([path]) =>
        !/from\s+["']next\/link["']/.test(
          stripComments(readFileSync(path, "utf8")),
        ),
    ).map(([path]) => path);
    expect(stale, `listed as allowed but no longer import next/link:\n${stale.join("\n")}`).toEqual([]);
  });
});
