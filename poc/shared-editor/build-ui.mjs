/**
 * Step 5: wildrunner's real ContentEditor.tsx — every plugin, toolbar and node — bundled for
 * a plain browser page with no Next.js and no Payload. Modules that talk to wildrunner's
 * backend are replaced by stubs; the list of stubs IS the adapter surface of the shared package.
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
const WR = process.argv[2];
const here = path.dirname(new URL(import.meta.url).pathname);
// host module -> why it is host-specific
export const SEAMS = {
  '@/components/members/editor/UploadPreview': 'resolves a media id over /api/media; draws R2/CF-image URLs',
  '@/lib/members/upload-image': 'POST /api/media, quota check, image processing endpoint',
  '@/lib/members/upload-video': 'direct-to-R2 multipart upload, transcode trigger',
  '@/components/members/media/MediaPickerDialog': 'browses /api/media (the member media library)',
};
const stubSrc = {
  '@/components/members/editor/UploadPreview': 'export function UploadPreview({ value }) { return null }',
  '@/lib/members/upload-image': 'export async function uploadImageFile() { throw new Error("no media adapter in POC") }',
  '@/lib/members/upload-video': 'export async function uploadVideoFile() { throw new Error("no media adapter in POC") }',
  '@/components/members/media/MediaPickerDialog': 'export function MediaPickerDialog() { return null }',
};
const reached = new Set();
const plugin = { name: 'seams', setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => (a.path in stubSrc ? { path: a.path, namespace: 'stub' } : undefined));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubSrc[a.path], loader: 'jsx' }));
  b.onResolve({ filter: /^@payloadcms\/richtext-lexical\/lexical/ }, (a) => {
    const sub = a.path.replace('@payloadcms/richtext-lexical/lexical', '');
    return b.resolve(sub === '' ? 'lexical' : sub.startsWith('/react/') ? `@lexical/react${sub.slice(6)}` : `@lexical${sub}`, { resolveDir: here, kind: a.kind });
  });
  b.onResolve({ filter: /^(lexical|@lexical\/|react($|\/)|react-dom)/ }, (a) => a.importer.startsWith(WR + '/src') || a.importer.includes('/stubs/') ? b.resolve(a.path, { resolveDir: here, kind: a.kind }) : undefined);
  b.onResolve({ filter: /^@\// }, (a) => { reached.add(a.path); return b.resolve('./' + a.path.slice(2), { resolveDir: path.join(WR, 'src'), kind: a.kind }); });
  b.onResolve({ filter: /^(@payloadcms|payload|next)(\/|$)/ }, (a) => ({ errors: [{ text: `host coupling reached: ${a.path} (from ${path.relative(WR, a.importer)})` }] }));
} };
const { metafile } = await esbuild.build({ metafile: true, entryPoints: [path.join(here, 'stubs/entry-ui.jsx')], bundle: true, format: 'esm', platform: 'browser',
  outfile: path.join(here, 'dist/ui.js'), plugins: [plugin], jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"production"' }, nodePaths: [path.join(WR, 'node_modules')] });
console.log(`stubbed host modules (the adapter surface): ${Object.keys(SEAMS).length}`);
for (const [k, v] of Object.entries(SEAMS)) console.log(`   ${k.padEnd(46)} ${v}`);
const real = Object.keys(metafile.inputs).filter((f) => path.resolve(f).startsWith(WR + '/src/'));
console.log(`wildrunner source files bundled unchanged: ${real.length}`);
