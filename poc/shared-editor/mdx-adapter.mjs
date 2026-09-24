/**
 * The jackywu.ca storage adapter: MDX file <-> Lexical JSON.
 *
 * Import reuses wildrunner's own mdast->Lexical converter for plain markdown
 * and adds only what MDX has that Payload does not:
 *   MDX component (<Route …/>)   -> Payload-shaped `block` {blockType: 'Route', attributes}
 *   other JSX (raw <img>, <svg>) -> `mdx-jsx` carrying its exact source text
 *   import / {expression}        -> `mdx-esm` / `mdx-expression`, verbatim
 *   ![alt](./x.jpg)              -> the existing `upload` node, value = the relative path
 *   ``` fence                    -> the existing Code `block`, language kept verbatim
 * Every type above that the editor has no class for rides through wildrunner's
 * UnknownNode passthrough untouched — that is the mechanism, not a special case.
 *
 * Export (Lexical -> mdast -> MDX text) is the new direction.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkStringify from 'remark-stringify';
import { mdastToLexical } from './dist/core.mjs';

export const COMPONENTS = new Set(['Route', 'Figure', 'Gallery', 'Video', 'MissingImage', 'InkRule']);
const parser = () => unified().use(remarkParse).use(remarkMdx).use(remarkGfm).use(remarkFrontmatter, ['yaml']);
const BOLD = 1, ITALIC = 2, STRIKE = 4, CODE = 16;

export function parseMdx(source) { return parser().parse(source); }

export function importMdx(source) {
  const tree = parseMdx(source);
  const warnings = [];
  let frontmatter = null;
  const children = [];
  const groups = [];   // which Lexical nodes each source block became, its exact text, and the gap before it
  let cursor = null;
  for (const node of tree.children) {
    if (node.type === 'yaml') { frontmatter = node.value; cursor = node.position.end.offset; continue; }
    const made = importBlock(node, source, warnings);
    const { start, end } = node.position;
    groups.push({ count: made.length, gap: cursor === null ? '' : source.slice(cursor, start.offset), source: source.slice(start.offset, end.offset) });
    cursor = end.offset;
    children.push(...made);
  }
  return { frontmatter, content: { root: { type: 'root', children, direction: null, format: '', indent: 0, version: 1 } }, warnings,
    baseline: { source, frontmatter, groups } };
}

function importBlock(node, source, warnings) {
  switch (node.type) {
    case 'mdxjsEsm': return [{ type: 'mdx-esm', version: 1, value: node.value }];
    case 'mdxFlowExpression': return [{ type: 'mdx-expression', version: 1, value: node.value }];
    case 'mdxJsxFlowElement':
      if (COMPONENTS.has(node.name) && node.children.length === 0) {
        return [{ type: 'block', format: '', version: 2, fields: { blockType: node.name, attributes: node.attributes.map(attr) } }];
      }
      return [{ type: 'mdx-jsx', version: 1, source: source.slice(node.position.start.offset, node.position.end.offset) }];
    case 'list':
      // Lexical's list item holds inline content only. A list whose items hold blocks
      // (a table, code, a second paragraph) cannot be represented, so it is carried as
      // its exact source rather than reshaped — the UnknownNode rule, applied to MDX.
      if (node.spread || node.children.some((li) => li.spread || li.children.some((c) => c.type !== 'paragraph' && c.type !== 'list'))) {
        return [{ type: 'mdx-source', version: 1, source: source.slice(node.position.start.offset, node.position.end.offset) }];
      }
      return mdastToLexical({ type: 'root', children: [node] }, warnings).root.children;
    case 'code':
      return [{ type: 'block', format: '', version: 2, fields: { blockType: 'Code', language: node.lang ?? '', meta: node.meta ?? null, code: node.value } }];
    case 'paragraph':
      if (node.children.some((c) => c.type === 'image' || isLinkedImage(c))) {
        // Lexical's image is a block, so a picture inside a line of text becomes its own block.
        // The only intentional reshaping in this adapter; see roundtrip.mjs for how it is counted.
        const out = []; let run = [];
        const flush = () => { const t = trimRun(run); if (t.length) out.push(...importBlock({ type: 'paragraph', children: t }, source, warnings)); run = []; };
        for (const c of node.children) {
          if (c.type !== 'image' && !isLinkedImage(c)) { run.push(c); continue; }
          flush();
          const img = c.type === 'image' ? c : c.children[0];
          const fields = { alt: img.alt ?? '', title: img.title ?? null };
          if (c.type === 'link') fields.link = { url: c.url, title: c.title ?? null };
          out.push({ type: 'upload', format: '', version: 3, relationTo: 'file', value: img.url, fields });
        }
        flush();
        return out;
      }
    // fallthrough: an ordinary paragraph
    default:
      return mdastToLexical({ type: 'root', children: [node] }, warnings).root.children;
  }
}

/** `[![thumb](./x.jpg)](https://youtube…)` — a picture that is a link. */
const isLinkedImage = (c) => c.type === 'link' && c.children.length === 1 && c.children[0].type === 'image';

/** Drop the whitespace-only edges a split leaves behind ("Result:\n" before a picture). */
function trimRun(run) {
  const r = run.filter((c) => !(c.type === 'text' && c.value.trim() === ''));
  if (r[0]?.type === 'text') r[0] = { ...r[0], value: r[0].value.replace(/^\s+/, '') };
  const last = r.length - 1;
  if (r[last]?.type === 'text') r[last] = { ...r[last], value: r[last].value.replace(/\s+$/, '') };
  return r;
}

/** A JSX attribute as data: `from={40}` keeps its source text `40`, never an evaluated value. */
const attr = (a) => a.type === 'mdxJsxAttribute'
  ? { name: a.name, value: a.value && typeof a.value === 'object' ? { expression: a.value.value } : a.value }
  : { spread: a.value };

// ---------------------------------------------------------------- export

/**
 * Minimal-diff save. `loaded` is the document as the editor first held it (after one
 * pass through Lexical), `baseline` what importMdx recorded. A source block whose
 * Lexical nodes are exactly as loaded is written back as its original text, so an
 * edit to one paragraph changes one paragraph in git — not the formatting of the file.
 */
export function exportMdx(doc, loaded, baseline) {
  if (!baseline) return stringify(doc.frontmatter, exportBlocks(doc.content.root.children));
  const key = (nodes) => nodes.map((n) => JSON.stringify(n)).join('\u0000');
  const now = doc.content.root.children;
  if (doc.frontmatter === baseline.frontmatter && key(now) === key(loaded.root.children)) return baseline.source;
  const known = []; let i = 0;
  for (const g of baseline.groups) { known.push({ ...g, key: key(loaded.root.children.slice(i, i + g.count)) }); i += g.count; }
  let out = doc.frontmatter === null ? '' : `---\n${doc.frontmatter}\n---`;
  let prev = -1;                                  // index of the source block written last, if it was verbatim
  for (let j = 0; j < now.length;) {
    const k = known.findIndex((g) => g.count && g.key === key(now.slice(j, j + g.count)));
    const text = k >= 0 ? known[k].source : stringify(null, exportBlocks([now[j]])).trimEnd();
    // Two blocks that were neighbours in the file keep the exact whitespace they had.
    // An edited block standing where the next original block stood inherits that block's gap too.
    const slot = k >= 0 ? k : known[prev + 1] ? prev + 1 : -1;
    const gap = slot >= 0 && slot === prev + 1 ? known[slot].gap : out === '' ? '' : '\n\n';
    out += gap + text;
    prev = slot; j += k >= 0 ? known[k].count : 1;
  }
  return out + baseline.source.slice(baseline.source.trimEnd().length);
}

function stringify(frontmatter, children) {
  if (frontmatter !== null) children.unshift({ type: 'yaml', value: frontmatter });
  return unified().use(remarkStringify, { bullet: '-', emphasis: '*', strong: '*', fence: '`', rule: '-' })
    .use(remarkMdx).use(remarkGfm, { tablePipeAlign: false }).use(remarkFrontmatter, ['yaml'])
    .stringify({ type: 'root', children });
}


function exportBlocks(nodes) {
  const out = [];
  for (const n of nodes) {
    switch (n.type) {
      case 'heading': out.push({ type: 'heading', depth: Number(n.tag.slice(1)), children: exportInline(n.children) }); break;
      case 'paragraph': out.push({ type: 'paragraph', children: exportInline(n.children) }); break;
      case 'quote': out.push({ type: 'blockquote', children: [{ type: 'paragraph', children: exportInline(n.children) }] }); break;
      case 'list': out.push(exportList(n)); break;
      case 'horizontalrule': out.push({ type: 'thematicBreak' }); break;
      case 'table': out.push({ type: 'table', align: [], children: n.children.map((row) => ({ type: 'tableRow',
        children: row.children.map((cell) => ({ type: 'tableCell', children: cell.children.flatMap((p) => exportInline(p.children ?? [])) })) })) }); break;
      case 'upload': {
        const image = { type: 'image', url: n.value, alt: n.fields?.alt ?? '', title: n.fields?.title ?? null };
        const link = n.fields?.link;
        out.push({ type: 'paragraph', children: [link ? { type: 'link', url: link.url, title: link.title, children: [image] } : image] });
        break;
      }
      case 'mdx-esm': out.push({ type: 'mdxjsEsm', value: n.value }); break;
      case 'mdx-expression': out.push({ type: 'mdxFlowExpression', value: n.value }); break;
      case 'mdx-jsx': case 'mdx-source': out.push({ type: 'html', value: n.source }); break;   // printed verbatim
      case 'block': out.push(exportBlock(n.fields)); break;
      default: throw new Error(`export: no MDX form for node type "${n.type}"`);
    }
  }
  return out;
}

function exportBlock(f) {
  if (f.blockType === 'Code') return { type: 'code', lang: f.language || null, meta: f.meta ?? null, value: f.code };
  if (COMPONENTS.has(f.blockType)) return { type: 'mdxJsxFlowElement', name: f.blockType, children: [],
    attributes: f.attributes.map((a) => 'spread' in a
      ? { type: 'mdxJsxExpressionAttribute', value: a.spread }
      : { type: 'mdxJsxAttribute', name: a.name, value: a.value && typeof a.value === 'object' ? { type: 'mdxJsxAttributeValueExpression', value: a.value.expression } : a.value }) };
  throw new Error(`export: unknown block "${f.blockType}"`);
}

function exportList(n) {
  const items = [];
  for (const li of n.children) {
    const inline = li.children.filter((c) => c.type !== 'list');
    const nested = li.children.filter((c) => c.type === 'list').map(exportList);
    if (inline.length === 0 && nested.length && items.length) { items[items.length - 1].children.push(...nested); continue; }
    items.push({ type: 'listItem', spread: false, checked: n.listType === 'check' ? !!li.checked : null,
      children: [{ type: 'paragraph', children: exportInline(inline) }, ...nested] });
  }
  return { type: 'list', ordered: n.listType === 'number', start: n.listType === 'number' ? n.start : null, spread: false, children: items };
}

/**
 * Lexical stores formatting as a bitmask per text run; mdast nests it.
 * Rebuild the nesting greedily: open whichever mark spans the longest run
 * from here, recurse inside it with that mark removed.
 */
function exportInline(nodes) {
  const items = nodes.map((n) => ({ n, marks: n.type === 'text' ? [BOLD, ITALIC, STRIKE].filter((m) => n.format & m) : [] }));
  return flat(nest(items));
}
const flat = (xs) => xs.flatMap((x) => x.type === 'fragment' ? x.children : x.children ? [{ ...x, children: flat(x.children) }] : [x]);
/**
 * The importer stores a bare URL as plain text; written back as text, remark
 * would escape it (`https\\://`) and it would stop being a link. GFM makes any
 * bare URL an autolink, so hand it back as one.
 */
function autolinks(text) {
  const parts = []; let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'link', url: m[0], title: null, children: [{ type: 'text', value: m[0] }] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts.length === 1 ? parts[0] : { type: 'fragment', children: parts };
}
function nest(items) {
  const out = [];
  for (let i = 0; i < items.length;) {
    const { n, marks } = items[i];
    if (marks.length === 0) { out.push(leaf(n)); i++; continue; }
    let best = marks[0], bestEnd = i + 1;
    for (const m of marks) { let j = i; while (j < items.length && items[j].marks.includes(m)) j++; if (j > bestEnd) { best = m; bestEnd = j; } }
    const inner = items.slice(i, bestEnd).map((it) => ({ n: it.n, marks: it.marks.filter((m) => m !== best) }));
    out.push({ type: best === BOLD ? 'strong' : best === ITALIC ? 'emphasis' : 'delete', children: nest(inner) });
    i = bestEnd;
  }
  return out;
}
const URL_RE = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g;
function leaf(n) {
  if (n.type === 'text') return n.format & CODE ? { type: 'inlineCode', value: n.text } : autolinks(n.text);
  // A soft line break: the importer turned each source newline into one of these.
  if (n.type === 'linebreak') return { type: 'text', value: '\n' };
  if (n.type === 'link') return { type: 'link', url: n.fields.url, title: null, children: exportInline(n.children) };
  throw new Error(`export: no inline MDX form for "${n.type}"`);
}
