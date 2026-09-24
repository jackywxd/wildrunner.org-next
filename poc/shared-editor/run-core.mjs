/**
 * Step 1b: run the bundled core. For every jackywu.ca MDX file:
 * wildrunner's importMarkdown -> Lexical JSON (Payload shape) -> roundTripPayloadContent
 * (parse into a headless plain-lexical editor, export, restore) -> must deep-equal.
 * Plus: an unknown node type survives byte-identically (the UnknownNode guarantee).
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { importMarkdown, roundTripPayloadContent } from './dist/core.mjs';
const root = process.argv[2];
const files = execSync(`find ${root}/src/content -name '*.mdx'`).toString().trim().split('\n').sort();
let ok = 0, warnings = 0;
for (const f of files) {
  const { content, warnings: w } = importMarkdown(readFileSync(f, 'utf8'));
  warnings += w.length;
  const canon = JSON.parse(JSON.stringify(content));
  assert.deepEqual(roundTripPayloadContent(content), canon, f);
  ok++;
}
console.log(`round trip through plain lexical: ${ok}/${files.length} files identical (${warnings} importer warnings, expected: MDX JSX is not markdown)`);
const alien = { type: 'gpx-route', version: 1, slug: 'whistler-utmb-100k-2026', from: 40, to: 55 };
const doc = { root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [alien] } };
assert.deepEqual(roundTripPayloadContent(doc).root.children[0], alien);
console.log('unknown node type survives the round trip unchanged: yes');
