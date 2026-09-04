import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * U-DICTREACH — `useDictionary()` only where a provider is guaranteed.
 *
 * `DictionaryProvider` is seeded in exactly one place, `(public)/layout.tsx`,
 * so `useDictionary()` throws in every other tree — the member dashboard, the
 * `(print)` root layout, `/admin`, a Route Handler. That is deliberate (a
 * missing provider is a bug and should say so), and it makes any component
 * shared between the public site and one of those a trap: it renders fine on
 * /gallery and takes the page down under /members.
 *
 * THE TRAP WAS SPRUNG THREE TIMES IN ONE PR, and each time by a different
 * mechanism, which is why this is a check and not a note in a file header:
 *
 *   TimelineMediaRow  Server parent, Client parent   → HTTP 500 on
 *                                                      /riders/<x>/timeline
 *   youtube-embed     rendered under (print) too     → would have 500'd there
 *   stream-video-player  member media dialog         → V-PICKFRAME-T2 on CI
 *
 * The route sweep could not see any of them: it renders the public routes,
 * where all three are correct. Only walking the imports answers "can a tree
 * without a provider reach this?", and that is a question about the source
 * rather than about a running page — so it belongs here, where it costs
 * milliseconds instead of a CI shard.
 *
 * THE FIX WHEN THIS FAILS is not to add a provider to the other tree. It is
 * to take the strings as props, the way `StreamVideoPlayer` takes
 * `transcodingLabel` — required, with no default, so a new call site cannot
 * quietly skip it.
 */

const SRC = "src";

/** Every root layout and route file that is NOT under `(public)`. */
const OUTSIDE = [
  /^src\/app\/\[lang\]\/\(site\)\/members\//,
  /^src\/app\/\(payload\)\//,
  /^src\/app\/\(print\)\//,
  /^src\/app\/api\//,
];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/**
 * Comments go first, for the third time in this PR. Written without it, this
 * check reported `stream-video-player.tsx` — a file whose only remaining
 * mention of the hook is the comment explaining why it no longer calls it.
 * `U-DICT` and `scripts/assert-test-strategy.mjs` both carry the same guard.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const code = new Map(
  sources(SRC).map((path) => [path, stripComments(readFileSync(path, "utf8"))]),
);

/** `@/x` and `./x` to a file that exists; a bare specifier is a package. */
function resolve(specifier: string, from: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? normalize(join(dirname(from), specifier))
      : null;
  if (base === null) return null;
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    if (code.has(candidate)) return candidate;
  }
  return null;
}

const imports = new Map(
  [...code].map(([path, source]) => [
    path,
    [...source.matchAll(/from\s+["']([^"']+)["']/g)]
      .map((match) => resolve(match[1], path))
      .filter((found): found is string => found !== null),
  ]),
);

const callsHook = new Set(
  [...code]
    .filter(
      ([path, source]) =>
        source.includes("useDictionary()") &&
        !path.endsWith("dictionary-provider.tsx"),
    )
    .map(([path]) => path),
);

test.describe("U-DICTREACH the client dictionary stays inside its provider", () => {
  test("U-DICTREACH-1: no tree without a provider can reach useDictionary()", () => {
    const roots = [...code.keys()].filter((path) =>
      OUTSIDE.some((pattern) => pattern.test(path)),
    );
    // Sanity, and cheap: a refactor that renames a route group would empty
    // this list and the check would pass by having nothing to check.
    expect(roots.length, "no routes outside (public) were found to walk").
      toBeGreaterThan(5);

    const exposed = new Map<string, string>();
    for (const root of roots) {
      const seen = new Set<string>();
      const stack = [root];
      while (stack.length) {
        const current = stack.pop() as string;
        if (seen.has(current)) continue;
        seen.add(current);
        if (callsHook.has(current) && current !== root) {
          exposed.set(current, root);
        }
        stack.push(...(imports.get(current) ?? []));
      }
    }

    const report = [...exposed].map(
      ([component, root]) => `${component} — reached from ${root}`,
    );
    expect(
      report,
      `useDictionary() reachable from a tree with no DictionaryProvider:\n${report.join("\n")}`,
    ).toEqual([]);
  });
});
