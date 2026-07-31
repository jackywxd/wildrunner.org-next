#!/usr/bin/env node
/**
 * `@lexical/table` is the one Lexical package this repo depends on directly.
 *
 * Everything else goes through @payloadcms/richtext-lexical's proxy exports
 * (`@payloadcms/richtext-lexical/lexical/...`), which are literally
 * `export * from '@lexical/<pkg>'` re-exports of whatever version that
 * package pins. There is no `./lexical/table` proxy export, so the member
 * editor has to import `@lexical/table` itself to register TableNode /
 * TableRowNode / TableCellNode.
 *
 * That is only safe while both resolve to the SAME module instance. Lexical
 * keys its node registry on the class object: two copies of `@lexical/table`
 * would make `TablePlugin` (which imports through the proxy's dependency
 * tree) construct a TableNode the editor never registered, and Lexical
 * throws "Create node: Attempted to create node TableNode that was not
 * configured" — at insert time, in the browser, not at build time.
 *
 * pnpm gives one instance exactly when the two version specs are identical,
 * so that is what this asserts. It fires on the realistic drift: bumping
 * @payloadcms/richtext-lexical without bumping @lexical/table in lockstep.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const ours = readJson(path.join(root, "package.json")).dependencies?.[
  "@lexical/table"
];
if (!ours) {
  console.error("@lexical/table is not a direct dependency");
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+$/.test(ours)) {
  // A range would let a fresh install pick a different version from the one
  // richtext-lexical pinned, which is the whole failure this guards.
  console.error(`@lexical/table must be pinned exactly, found "${ours}"`);
  process.exit(1);
}

// Through the node_modules symlink rather than require.resolve: the package
// does not expose "./package.json" in its `exports`, so require.resolve on it
// throws ERR_PACKAGE_PATH_NOT_EXPORTED. The symlink target is a plain path,
// and following it avoids hard-coding pnpm's peer-dependency hash — that
// directory name changes whenever any peer does.
const payloadDir = fs.realpathSync(
  path.join(root, "node_modules", "@payloadcms", "richtext-lexical"),
);
const theirs = readJson(path.join(payloadDir, "package.json")).dependencies?.[
  "@lexical/table"
];

if (theirs !== ours) {
  console.error(
    `@lexical/table version drift: package.json pins ${ours}, ` +
      `@payloadcms/richtext-lexical depends on ${theirs}. ` +
      `Bump ours to match, or table nodes will resolve to a second copy.`,
  );
  process.exit(1);
}

// Belt and braces: even with matching specs, an unlucky lockfile could carry
// two entries. The store layout is flat, one directory per version.
const store = path.join(root, "node_modules", ".pnpm");
const copies = fs
  .readdirSync(store)
  .filter((entry) => entry.startsWith("@lexical+table@"));
if (copies.length !== 1) {
  console.error(`Expected exactly one @lexical/table copy, found: ${copies}`);
  process.exit(1);
}

console.log(
  JSON.stringify({ ok: true, "@lexical/table": ours, copies }, null, 2),
);
