import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import config from "../../tailwind.config";

/**
 * U-TEXTFLOOR — nothing a visitor has to read is set below 12px, and the two
 * names the floor is built from resolve to something.
 *
 * Measured at 375px before this existed: 41% of the characters on /races and
 * 70% on /riders were under 14px, and the smallest were the ones that
 * mattered — series tags, registration status and the 「前往報名」 link at
 * 11px, the in-progress and finished markers at 10px, an upload's failure
 * reason at 11px and truncated. None of it looked wrong in review, because
 * each call site was one arbitrary value next to others like it; that is
 * exactly how a floor erodes, and why this reads the source rather than a
 * page. It catches literal classes, which is all of them today.
 *
 * The second test is the other half of the same failure. Tailwind emits
 * nothing for an unknown utility and says nothing about it — `font-heading`
 * sat in twenty components doing nothing for months (U-FONTUTIL) — so a
 * `text-tag` whose config entry went missing would put every tag on the site
 * back to the inherited size without a single visible error, and a
 * `hit-area` whose rule went missing would shrink every chip's touch target
 * back to its drawn box.
 */

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

test.describe("U-TEXTFLOOR readable text sizes", () => {
  test("U-TEXTFLOOR-1: no text-[Npx] under 12px anywhere under src/", () => {
    const offenders: string[] = [];
    let scanned = 0;

    for (const file of sourceFiles("src")) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/(?<![\w-])text-\[(\d+(?:\.\d+)?)px\]/g)) {
        scanned += 1;
        if (Number(match[1]) < 12) offenders.push(`${match[0]} (${file})`);
      }
    }

    // `text-[17px]` is written in the mobile menu and the editor today, so a
    // scan that finds nothing has stopped reading the files.
    expect(scanned, "no text-[Npx] classes found — the scan is broken").toBeGreaterThan(0);

    // Use `text-tag` (13px) for tags, chips and statuses, `text-sm` for
    // secondary lines. A size below 12px is not a smaller style of the same
    // text; on a phone it is text that is not there.
    expect(offenders).toEqual([]);
  });

  test("U-TEXTFLOOR-2: text-tag and hit-area are defined, not just written", () => {
    const fontSize = (config.theme?.extend as { fontSize?: Record<string, unknown> })
      ?.fontSize;
    expect(fontSize?.tag, "tailwind.config.ts has no fontSize.tag").toBeDefined();

    const css = readFileSync("src/styles/globals.css", "utf8");
    expect(css, "globals.css has no .hit-area::after rule").toMatch(
      /\.hit-area::after\s*\{[^}]*width:\s*max\(100%,\s*44px\)[^}]*height:\s*max\(100%,\s*44px\)/,
    );
  });
});
