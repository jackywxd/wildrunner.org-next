#!/usr/bin/env node
/**
 * Rebuild the local database into the same corpus CI builds.
 *
 * WHY. CI starts every job from an empty database and seeds a known corpus; a
 * developer's machine inherits everything every previous run and walkthrough
 * left behind. AGENTS.md calls local D1 what it is — e2e residue. That gap is
 * not cosmetic: two journeys collided with rows created minutes earlier, and
 * both times the reflex was to add logic that *scans for unused data* rather
 * than to prepare the environment. A test hunting for a free slot is
 * compensating for a baseline nobody built, and it makes each run depend on
 * the history of the last.
 *
 * So: setup is mandatory and it runs every time. This is that setup.
 *
 * WHAT IT TOUCHES, AND WHAT IT MUST NOT. Only
 * `.wrangler/state/v3/d1` — 4 MB of emulated database. Next to it sits
 * `.wrangler/state/v3/r2`, about 4 GB of emulated media objects that every
 * local media URL resolves through. Removing `state/` wholesale would take
 * both, so the path is spelled out rather than globbed, and the R2 directory
 * is asserted to survive.
 *
 * REFUSES TO RUN AGAINST ANYTHING ELSE. `CLOUDFLARE_ENV` selects a deployed
 * environment and `NODE_ENV=production` makes the adapter reach real bindings
 * — either one present means this is not the local database, and the script
 * stops. Deleting the fallback would only mean the next person adds one back;
 * making the unsafe combination fail loudly is what cannot be reintroduced
 * quietly.
 */
import { execSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";

const D1_DIR = ".wrangler/state/v3/d1";
const R2_DIR = ".wrangler/state/v3/r2";

if (process.env.CLOUDFLARE_ENV) {
  console.error(
    `Refusing to run: CLOUDFLARE_ENV=${process.env.CLOUDFLARE_ENV} selects a ` +
      `deployed environment. This resets the *local* emulated database only.`,
  );
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error(
    "Refusing to run: NODE_ENV=production makes the adapter reach real " +
      "bindings, and would also apply migrations on connect.",
  );
  process.exit(1);
}

const r2Before = existsSync(R2_DIR) ? statSync(R2_DIR).isDirectory() : false;

if (existsSync(D1_DIR)) {
  rmSync(D1_DIR, { recursive: true, force: true });
  console.log(`[reset] removed ${D1_DIR}`);
} else {
  console.log(`[reset] ${D1_DIR} was already absent`);
}

if (r2Before && !existsSync(R2_DIR)) {
  console.error(
    `[reset] ${R2_DIR} disappeared — that is 4 GB of emulated media and this ` +
      `script must never touch it. Stopping.`,
  );
  process.exit(1);
}

/**
 * The same steps, in the same order, as `.github/workflows/e2e.yml`. Ordering
 * is load-bearing: `seed:e2e:account` owns whatever the two before it made.
 *
 * `seed:editions` runs LAST on purpose, not just by inheritance from an old
 * dependency. It upserts `data/race-editions.csv` directly (see
 * import-race-editions.ts) — it no longer needs `race_schedule` to exist
 * first — but `seed:e2e:account` creates race-records, and a record naming
 * an (event, year) with no edition yet gets a *minimal* one auto-created as
 * a side effect (populateRaceRecordRefs, RaceRecords.ts). Running the CSV
 * import afterward means any such stub is upgraded with real data whenever
 * the CSV happens to cover that exact (event, year) — it treats "no
 * verified_at yet" the same as "nothing to protect".
 */
const STEPS = [
  ["pnpm payload migrate", "schema"],
  ["pnpm migrate:velite", "authors, posts, galleries"],
  ["pnpm seed:races", "race schedule"],
  ["pnpm seed:e2e:account", "the test account, and ownership"],
  ["pnpm seed:editions", "editions imported from the reviewed CSV"],
  // Order-independent of the two above: it only ever updates qualifier
  // columns on categories the schema step already created, and touches no
  // other collection. Last because it is the cheapest to re-run alone.
  ["pnpm seed:qualifiers", "Western States / Hardrock qualifier flags"],
];

for (const [command, what] of STEPS) {
  console.log(`[reset] ${command}  (${what})`);
  execSync(command, {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, PAYLOAD_SECRET: process.env.PAYLOAD_SECRET },
  });
}

/**
 * Read the row counts back, because none of the steps above can be trusted to
 * report what it wrote.
 *
 * `pnpm migrate:velite` has now been seen three times producing no output,
 * writing no rows and exiting 0 — twice on 2026-08-30, and once recorded in
 * PR #93 as "only happened once". The reset then reported success over an
 * empty database, and the browser suite ran against a corpus nobody built.
 * AGENTS.md already describes what that costs: eight consecutive runs
 * degrading monotonically while three different explanations were reached for
 * and all three were wrong.
 *
 * The root cause is still open. What is known: the child dies inside
 * wrangler's `getPlatformProxy()`, after its "Proxy environment variables
 * detected" warning and before its "Using secrets defined in .env" line —
 * no output, no rows, status 0, which is the signature of a top-level await
 * that never settles with nothing left on the event loop. Whatever it turns
 * out to be, a setup step that cannot report its own failure is this script's
 * problem, and that half is fixable now.
 *
 * Non-empty, not exact counts: the corpus grows whenever content is added,
 * and a guard that has to be edited for every new post is a guard that gets
 * deleted. Zero is the failure this exists for.
 *
 * Through `wrangler d1 execute`, not a purpose-written probe — it is the tool
 * that already works against this file, and AGENTS.md is explicit that a
 * probe written five minutes ago is the wrong instrument.
 */
const MUST_NOT_BE_EMPTY = [
  ["posts", "pnpm migrate:velite"],
  ["media", "pnpm migrate:velite"],
  ["galleries", "pnpm migrate:velite"],
  ["race_events", "pnpm seed:races"],
  ["users", "pnpm seed:e2e:account"],
  ["race_editions", "pnpm seed:editions"],
];

// One row of subqueries rather than a UNION per table: D1's SQLite is built
// with a low SQLITE_MAX_COMPOUND_SELECT, and six `UNION ALL` terms come back
// as "too many terms in compound SELECT". Found by running this, not by
// reading about it.
//
// No backticks around the table names: execSync goes through /bin/sh, where a
// backtick is command substitution — each name would be replaced by the output
// of running it, leaving `FROM  ,` and a syntax error. Also found by running it.
const sql = MUST_NOT_BE_EMPTY.map(
  ([table]) => `(SELECT COUNT(*) FROM ${table}) AS ${table}`,
).join(", ");

const raw = execSync(
  `npx wrangler d1 execute wildrunner-org-next --local --json --command "SELECT ${sql}"`,
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

// Shape-checked before it is read. The first version of a guard written in
// this repository misread the driver's result shape, logged four undefineds
// and skipped its own check while reporting success — a broken probe is worse
// than none, because its silence reads as "no problem". This one was watched
// failing on an empty table before it was kept.
let row;
try {
  row = JSON.parse(raw)?.[0]?.results?.[0];
} catch {
  row = undefined;
}
if (!row || MUST_NOT_BE_EMPTY.some(([table]) => typeof row[table] !== "number")) {
  console.error(
    `[reset] could not read the row counts back. wrangler said:\n${raw.slice(0, 500)}`,
  );
  process.exit(1);
}

const counts = new Map(MUST_NOT_BE_EMPTY.map(([table]) => [table, row[table]]));
console.log(
  `\n[reset] ${MUST_NOT_BE_EMPTY.map(([t]) => `${t}=${counts.get(t)}`).join("  ")}`,
);

const empty = MUST_NOT_BE_EMPTY.filter(([table]) => !(counts.get(table) > 0));
if (empty.length > 0) {
  console.error(
    `\n[reset] FAILED — these tables are empty after steps that all exited 0:\n` +
      empty
        .map(([table, step]) => `  ${table}  (written by ${step})`)
        .join("\n") +
      `\n\nRun that step on its own and read the counts again. It has been seen\n` +
      `exiting 0 with no output and no rows; re-running it usually works.`,
  );
  process.exit(1);
}

console.log(
  "[reset] done — those counts were read back from the database, not " +
    "inferred from the steps exiting.",
);
