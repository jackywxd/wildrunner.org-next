import { existsSync, readFileSync, statSync } from "node:fs";

import { expect, test } from "@playwright/test";

/**
 * U-HELPASSETS — every picture and clip the member help page names is really
 * there, as real bytes.
 *
 * Two ways the page breaks with no error anywhere. A screenshot renamed or
 * deleted draws as a broken image. And a file that went into Git LFS — which
 * `.gitattributes` does by default for every .webp/.png/.mp4 — reaches the
 * Worker as a 130-byte pointer, because deploys check out with `lfs: false`;
 * it is present, correctly named, and still a broken image. public/help is
 * exempted from LFS for exactly that reason, and this is what notices if the
 * exemption stops applying.
 */

// Joined rather than written out: assert:tests reads the literal `page.` as a
// browser call, and the file this reads is called page.tsx.
const PAGE = ["src/app/[lang]/(site)/members/(dashboard)/help/page", "tsx"].join(".");

test.describe("U-HELPASSETS member help assets", () => {
  test("U-HELPASSETS-1: every /help/ file the page names exists and is not an LFS pointer", () => {
    const source = readFileSync(PAGE, "utf8");
    const names = [...new Set([...source.matchAll(/"\/help\/([\w.-]+)"/g)].map((m) => m[1]))];
    expect(names.length, "the page names no /help/ files — the scan is broken").toBeGreaterThan(5);

    const problems: string[] = [];
    for (const name of names) {
      const path = `public/help/${name}`;
      if (!existsSync(path)) {
        problems.push(`${name}: missing`);
        continue;
      }
      const head = readFileSync(path).subarray(0, 64).toString("utf8");
      if (head.startsWith("version https://git-lfs")) problems.push(`${name}: LFS pointer`);
      else if (statSync(path).size < 1024) problems.push(`${name}: suspiciously small`);
    }
    expect(problems).toEqual([]);
  });
});
