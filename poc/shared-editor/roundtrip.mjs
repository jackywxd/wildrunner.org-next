/**
 * Step 2: every jackywu.ca MDX file through
 *   importMdx -> roundTripPayloadContent (the real editor core, plain lexical) -> exportMdx
 * then compare the re-parsed syntax tree with the original's.
 * With --write <site>, the round-tripped files replace the originals in that site copy.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { roundTripPayloadContent } from './dist/core.mjs';
import { importMdx, exportMdx, parseMdx } from './mdx-adapter.mjs';

const [src, flag, dest] = process.argv.slice(2);
const files = execSync(`cd ${src} && find src/content -name '*.mdx'`).toString().trim().split('\n').sort();
const strip = (n) => { if (Array.isArray(n)) return n.map(strip); if (n && typeof n === 'object') {
  const o = {}; for (const [k, v] of Object.entries(n)) if (k !== 'position' && k !== 'data') o[k] = strip(v); return o; } return n; };
let same = 0, bytes = 0; const diffs = [];
for (const f of files) {
  const original = readFileSync(path.join(src, f), 'utf8');
  const doc = importMdx(original);
  const edited = { frontmatter: doc.frontmatter, content: roundTripPayloadContent(doc.content) };
  const out = exportMdx(edited);
  if (out === original) bytes++;
  if (isDeepStrictEqual(strip(parseMdx(out)), strip(parseMdx(original)))) same++;
  else diffs.push([f, doc.warnings.map((w) => w.code)]);
  if (flag === '--write') writeFileSync(path.join(dest, f), out);
}
console.log(`syntax tree identical after round trip: ${same}/${files.length}   byte-identical text: ${bytes}/${files.length}`);
for (const [f, w] of diffs) console.log('  differs:', f, w.length ? `(importer warnings: ${[...new Set(w)].join(', ')})` : '');
