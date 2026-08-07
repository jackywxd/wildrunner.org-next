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
 * is load-bearing: `seed:e2e:account` owns whatever the two before it made,
 * and `seed:editions` derives editions from a schedule that must already
 * exist — the migration's own derivation runs against an empty table here.
 */
const STEPS = [
  ["pnpm payload migrate", "schema"],
  ["pnpm migrate:velite", "authors, posts, galleries"],
  ["pnpm seed:races", "race schedule"],
  ["pnpm seed:e2e:account", "the test account, and ownership"],
  ["pnpm seed:editions", "editions derived from the schedule"],
];

for (const [command, what] of STEPS) {
  console.log(`[reset] ${command}  (${what})`);
  execSync(command, {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, PAYLOAD_SECRET: process.env.PAYLOAD_SECRET },
  });
}

console.log(
  "\n[reset] done. Verify with the row counts, not with this message — " +
    "a seed script that exits cleanly has not proven it wrote anything.",
);
