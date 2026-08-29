/**
 * Deploy, and tell the Worker which build it is.
 *
 * Without this, a code change that alters a prerendered page never reaches
 * a visitor. `/about` served `<html lang="en">` for a whole day after the
 * commit that changed it to `zh-Hant` had deployed — the Worker was new,
 * the page was not — and V10 was red on staging through three attempts of
 * the deploy run while the assertion was correct the entire time.
 *
 * The mismatch, all of it readable in the adapter:
 *
 *   - `overrides/incremental-cache/r2-incremental-cache.js` keys every entry
 *     with `process.env.OPEN_NEXT_BUILD_ID`, and `overrides/internal.js`
 *     falls back to the literal `"no-build-id"` when that is undefined.
 *   - Nothing ever defines it. The adapter's build injects
 *     `__OPEN_NEXT_BUILD_ID` (a different variable, for the Durable Object)
 *     and nothing else; it is absent from wrangler.jsonc, next.config.ts and
 *     the workflow, and absent from the binding table `wrangler deploy`
 *     prints.
 *   - `commands/populate-cache.js` derives the id from the directory names
 *     under `.open-next/cache`, so it writes under the *real* build id.
 *
 * So the deploy uploads this build's prerendered pages to a key nobody
 * reads, the Worker misses, renders once, writes the result under
 * `no-build-id`, and serves that copy for the life of the bucket. Every
 * later deploy repeats the ritual against a different key. Nothing warns,
 * because from inside the Worker a cache hit is a cache hit.
 *
 * Passing the id as a plain var closes it: `templates/init.js`'s
 * `populateProcessEnv` copies every string var on `env` into `process.env`
 * at startup, so the runtime reads the same id populate wrote.
 *
 * A script rather than `--var OPEN_NEXT_BUILD_ID:$(cat …)` inline in
 * package.json for one reason: a blank id does not fail. `computeCacheKey`
 * defaults only on `undefined`, so an empty string produces a key that is
 * merely *different* — every read misses forever, every page renders on
 * every request, and the only symptom is a slower site. This refuses to
 * deploy instead, and reads the id from the directory populate reads rather
 * than from `assets/BUILD_ID`, because a value that agrees with one and not
 * the other would reinstate the exact mismatch it exists to close.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUTPUT_DIR = path.join(process.cwd(), ".open-next");
const CACHE_DIR = path.join(OUTPUT_DIR, "cache");
const BUILD_ID_ASSET = path.join(OUTPUT_DIR, "assets", "BUILD_ID");

/**
 * This build's id, or an exit.
 *
 * The cache directory is the authority because it is what populate-cache
 * parses. `assets/BUILD_ID` is the fallback for a build with nothing to
 * cache at all, where there is no directory to read and also nothing whose
 * key could disagree.
 */
function resolveBuildId() {
  const dirs = fs.existsSync(CACHE_DIR)
    ? fs
        .readdirSync(CACHE_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

  if (dirs.length === 1) return dirs[0];

  if (dirs.length > 1) {
    // Two build ids in one output directory means a stale `.open-next` was
    // built on top of. Picking one would stamp the Worker with an id half
    // its cache does not use.
    console.error(
      `deploy-with-build-id: ${CACHE_DIR} holds more than one build id ` +
        `(${dirs.join(", ")}). Remove .open-next and build again.`,
    );
    process.exit(1);
  }

  if (fs.existsSync(BUILD_ID_ASSET)) {
    const fromAsset = fs.readFileSync(BUILD_ID_ASSET, "utf8").trim();
    if (fromAsset) return fromAsset;
  }

  console.error(
    "deploy-with-build-id: no build id found. Expected a directory under " +
      `${CACHE_DIR} or a non-empty ${BUILD_ID_ASSET}. Run the build first.`,
  );
  process.exit(1);
}

const buildId = resolveBuildId();
// Printed because the deploy log is where this gets checked: `wrangler
// deploy` lists the Worker's bindings, so a run that worked shows
// `env.OPEN_NEXT_BUILD_ID ("…")` with this same value beside it, and a run
// where the flag was swallowed shows no such line.
console.log(`deploy-with-build-id: stamping OPEN_NEXT_BUILD_ID=${buildId}`);

// `--var` is not a flag the adapter knows, and that is what makes this work:
// its CLI parses with `unknown-options-as-args`, so unrecognised flags
// become positionals and `getWranglerArgs` forwards them to wrangler
// verbatim (dist/cli/index.js). It also strips `--` from argv before
// parsing, so a separator would be neither needed nor harmful.
// `shell: true` matches scripts/with-env.mjs, which spawns its command the
// same way — these run through `pnpm run`, which puts node_modules/.bin on
// PATH, and the shell is what finds it there.
const result = spawnSync(
  "opennextjs-cloudflare",
  ["deploy", ...process.argv.slice(2), "--var", `OPEN_NEXT_BUILD_ID:${buildId}`],
  { stdio: "inherit", shell: true },
);

process.exit(result.status ?? 1);
