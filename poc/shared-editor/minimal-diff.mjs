/**
 * Step 4: saving writes only what changed.
 *  (a) open + save without edits -> every file byte-identical
 *  (b) edit one paragraph's text -> the git diff is that paragraph and nothing else
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { roundTripPayloadContent } from './dist/core.mjs';
import { importMdx, exportMdx } from './mdx-adapter.mjs';
const src = process.argv[2];
const files = execSync(`cd ${src} && find src/content -name '*.mdx'`).toString().trim().split('\n').sort();
let identical = 0, minimal = 0, edited = 0;
for (const f of files) {
  const original = readFileSync(path.join(src, f), 'utf8');
  const d = importMdx(original);
  const loaded = roundTripPayloadContent(d.content);                  // what the editor holds on open
  if (exportMdx({ frontmatter: d.frontmatter, content: roundTripPayloadContent(loaded) }, loaded, d.baseline) === original) identical++;

  // (b) the author changes the last word run of the first plain paragraph
  const next = structuredClone(loaded);
  const para = next.root.children.find((n) => n.type === 'paragraph' && n.children.at(-1)?.type === 'text' && n.children.at(-1).format === 0);
  if (!para) continue;
  edited++;
  para.children.at(-1).text += '（修訂）';
  const out = exportMdx({ frontmatter: d.frontmatter, content: roundTripPayloadContent(next) }, loaded, d.baseline);
  const a = original.split('\n'), b = out.split('\n');
  const changed = a.length === b.length ? a.filter((l, k) => l !== b[k]).length : Infinity;
  if (changed === 1 && out.includes('（修訂）')) minimal++;
  else console.log('  not minimal:', f, 'lines', a.length, '->', b.length, 'changed', changed);
}
console.log(`save without edits -> byte-identical: ${identical}/${files.length}`);
console.log(`edit one paragraph -> exactly one line changed in the file: ${minimal}/${edited}`);
