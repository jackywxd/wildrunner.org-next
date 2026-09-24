import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
const root = process.argv[2];
const files = execSync(`find ${root}/src/content -name '*.md' -o -name '*.mdx'`).toString().trim().split('\n');
const counts = {}, jsx = {}, perFile = {};
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const p = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']);
  if (f.endsWith('.mdx')) p.use(remarkMdx);
  const tree = p.parse(src);
  const walk = (n) => { counts[n.type] = (counts[n.type] ?? 0) + 1; perFile[n.type] ??= new Set(); perFile[n.type].add(f);
    if (n.type.startsWith('mdxJsx')) jsx[`${n.type}:${n.name}`] = (jsx[`${n.type}:${n.name}`] ?? 0) + 1;
    (n.children ?? []).forEach(walk); };
  walk(tree);
}
console.log('files', files.length, 'mdx', files.filter(f=>f.endsWith('.mdx')).length);
for (const [k, v] of Object.entries(counts).sort((a,b)=>b[1]-a[1])) console.log(k.padEnd(22), String(v).padStart(6), 'in', perFile[k].size, 'files');
console.log(jsx);
