/**
 * Step 1: bundle wildrunner's REAL editor core (src/lib/editor + src/lib/mdx-import)
 * with no Payload and no Next.js, only plain `lexical` 0.41.0. All lexical imports resolve
 * through the same (ESM) conditions: resolving one through `require` gave the bundle two
 * copies and Lexical refused its own nodes — the landmine assert-lexical-single-copy guards.
 *
 * Two rewrites, and nothing else:
 *   @payloadcms/richtext-lexical/lexical[/x]  -> lexical / @lexical/x   (the proxy is `export *`)
 *   @/components/members/editor/UploadPreview -> stubs/UploadPreview   (the only UI import)
 * The build FAILS if anything else from @payloadcms, payload or next is reached.
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
const WR = process.argv[2];                       // wildrunner checkout
const here = path.dirname(new URL(import.meta.url).pathname);
const plugin = {
  name: 'host-seams',
  setup(b) {
    b.onResolve({ filter: /^@payloadcms\/richtext-lexical\/lexical/ }, (a) => {
      const sub = a.path.replace('@payloadcms/richtext-lexical/lexical', '');
      const target = sub === '' ? 'lexical' : sub.startsWith('/react/') ? `@lexical/react${sub.slice(6)}` : `@lexical${sub}`;
      return b.resolve(target, { resolveDir: here, kind: a.kind });
    });
    // Only for imports written in wildrunner source; Lexical's own internal imports resolve normally.
    b.onResolve({ filter: /^(lexical|@lexical\/|react($|\/)|react-dom)/ }, (a) => a.importer.startsWith(WR + '/src') || a.importer.includes('/stubs/') ? b.resolve(a.path, { resolveDir: here, kind: a.kind }) : undefined);
    b.onResolve({ filter: /^@\/components\/members\/editor\/UploadPreview$/ }, () => ({ path: path.join(here, 'stubs/UploadPreview.jsx') }));
    b.onResolve({ filter: /^@\// }, (a) => b.resolve('./' + a.path.slice(2), { resolveDir: path.join(WR, 'src'), kind: a.kind }));
    b.onResolve({ filter: /^(@payloadcms|payload|next)(\/|$)/ }, (a) => ({ errors: [{ text: `host coupling reached: ${a.path} (from ${path.relative(WR, a.importer)})` }] }));
  },
};
const result = await esbuild.build({
  entryPoints: [path.join(here, 'stubs/entry-core.js')],
  bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'],
  outfile: path.join(here, 'dist/core.mjs'), plugins: [plugin], jsx: 'automatic',
  logLevel: 'error', metafile: true, conditions: ['import', 'module', 'default'],
  nodePaths: [path.join(WR, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
});
const inputs = Object.keys(result.metafile.inputs);
const wrFiles = inputs.filter((f) => !f.includes('node_modules') && !f.includes('stubs/')).map((f) => path.relative(WR, path.resolve(f)));
console.log(`bundled ${wrFiles.length} wildrunner source files unchanged:`);
for (const f of wrFiles.sort()) console.log('   ', f);
console.log('any @payloadcms/payload/next in bundle:', inputs.some((f) => /node_modules\/(\.pnpm\/)?(@payloadcms|payload@|next@)/.test(f)));
