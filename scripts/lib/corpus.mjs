/**
 * Building the fixture corpus, and reading back that it is actually there.
 *
 * WHY THIS IS A MODULE AND NOT TWO COPIES. The steps below were written for
 * `reset-local-db.mjs` and then written again, by hand, into
 * `.github/workflows/e2e.yml` — that file's own comments admit it ("see
 * scripts/reset-local-db.mjs, which mirrors this same ordering"). Two lists
 * that must stay in the same order, in two languages, is the shape that
 * drifts; and it drifted in the direction that matters least visibly, because
 * a developer's corpus and CI's corpus differing is exactly the thing neither
 * one can see.
 *
 * It now matters more than it did. The fixture cache is populated from `main`
 * and read by every pull request, so whatever this produces once is what the
 * whole queue of PRs tests against until an input changes.
 */
import { execSync } from "node:child_process";

/**
 * In order, and the order is load-bearing.
 *
 * `seed:e2e:account` is after the two that create content because it owns
 * whatever they created — `/riders` selects authors with an owner, and
 * `setOwner` stamps that from the authenticated user, which a CLI script does
 * not have.
 *
 * `seed:editions` is after that again: a race record created above can
 * auto-create a *minimal* edition as a side effect (`populateRaceRecordRefs`)
 * when its (event, year) has none, and running the CSV import afterwards
 * upgrades any such stub with the reviewed data.
 *
 * `seed:qualifiers` is order-independent — it only updates qualifier columns
 * on categories the schema step already created — and is last because it is
 * the cheapest to re-run alone.
 */
export const SEED_STEPS = [
  ["pnpm payload migrate", "schema"],
  ["pnpm migrate:velite", "authors, posts, galleries"],
  ["pnpm seed:races", "race schedule"],
  ["pnpm seed:e2e:account", "the test account, and ownership"],
  ["pnpm seed:editions", "editions imported from the reviewed CSV"],
  ["pnpm seed:qualifiers", "Western States / Hardrock qualifier flags"],
];

export function runSeeds(label) {
  for (const [command, what] of SEED_STEPS) {
    console.log(`[${label}] ${command}  (${what})`);
    execSync(command, {
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, PAYLOAD_SECRET: process.env.PAYLOAD_SECRET },
    });
  }
}

/**
 * Read the row counts back, because none of the steps above can be trusted to
 * report what it wrote.
 *
 * `pnpm migrate:velite` has been seen producing no output, writing no rows and
 * exiting 0 — twice on 2026-08-30, once recorded in PR #93 as "only happened
 * once", and three times running on 2026-09-05 before a fourth attempt
 * seeded. The reset then reported success over an empty database and the
 * browser suite ran against a corpus nobody built. AGENTS.md describes what
 * that costs: eight consecutive runs degrading monotonically while three
 * different explanations were reached for and all three were wrong.
 *
 * The root cause is still open. What is known: the child dies inside
 * wrangler's `getPlatformProxy()`, after its "Proxy environment variables
 * detected" warning and before its "Using secrets defined in .env" line — no
 * output, no rows, status 0, which is the signature of a top-level await that
 * never settles with nothing left on the event loop.
 *
 * THIS IS WHY CI CALLS IT TOO, and not only the local reset. CI seeds into a
 * cache that `main` populates and every pull request reads, so a silent empty
 * seed would no longer cost one run — it would be saved under the key and
 * handed to every PR until an input changed. The failure this guard was
 * written for is the failure the shared cache would amplify.
 *
 * Non-empty, not exact counts: the corpus grows whenever content is added, and
 * a guard that has to be edited for every new post is a guard that gets
 * deleted. Zero is the failure this exists for.
 *
 * Through `wrangler d1 execute`, not a purpose-written probe — it is the tool
 * that already works against this file, and AGENTS.md is explicit that a probe
 * written five minutes ago is the wrong instrument.
 */
const MUST_NOT_BE_EMPTY = [
  ["posts", "pnpm migrate:velite"],
  ["media", "pnpm migrate:velite"],
  ["galleries", "pnpm migrate:velite"],
  ["race_events", "pnpm seed:races"],
  ["users", "pnpm seed:e2e:account"],
  ["race_editions", "pnpm seed:editions"],
];

export function verifyCorpus(label) {
  // One row of subqueries rather than a UNION per table: D1's SQLite is built
  // with a low SQLITE_MAX_COMPOUND_SELECT, and six `UNION ALL` terms come back
  // as "too many terms in compound SELECT". Found by running this, not by
  // reading about it.
  //
  // No backticks around the table names: execSync goes through /bin/sh, where a
  // backtick is command substitution — each name would be replaced by the
  // output of running it, leaving `FROM  ,` and a syntax error. Also found by
  // running it.
  const sql = MUST_NOT_BE_EMPTY.map(
    ([table]) => `(SELECT COUNT(*) FROM ${table}) AS ${table}`,
  ).join(", ");

  const raw = execSync(
    `npx wrangler d1 execute wildrunner-org-next --local --json --command "SELECT ${sql}"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );

  // Shape-checked before it is read. The first version of a guard written in
  // this repository misread the driver's result shape, logged four undefineds
  // and skipped its own check while reporting success — a broken probe is
  // worse than none, because its silence reads as "no problem". This one was
  // watched failing on an empty table before it was kept.
  let row;
  try {
    row = JSON.parse(raw)?.[0]?.results?.[0];
  } catch {
    row = undefined;
  }
  if (!row || MUST_NOT_BE_EMPTY.some(([table]) => typeof row[table] !== "number")) {
    console.error(
      `[${label}] could not read the row counts back. wrangler said:\n${raw.slice(0, 500)}`,
    );
    process.exit(1);
  }

  const counts = new Map(MUST_NOT_BE_EMPTY.map(([table]) => [table, row[table]]));
  console.log(
    `\n[${label}] ${MUST_NOT_BE_EMPTY.map(([t]) => `${t}=${counts.get(t)}`).join("  ")}`,
  );

  const empty = MUST_NOT_BE_EMPTY.filter(([table]) => !(counts.get(table) > 0));
  if (empty.length > 0) {
    console.error(
      `\n[${label}] FAILED — these tables are empty after steps that all exited 0:\n` +
        empty.map(([table, step]) => `  ${table}  (written by ${step})`).join("\n") +
        `\n\nRun that step on its own and read the counts again. It has been seen\n` +
        `exiting 0 with no output and no rows; re-running it usually works.`,
    );
    process.exit(1);
  }

  console.log(
    `[${label}] done — those counts were read back from the database, not ` +
      "inferred from the steps exiting.",
  );
}
