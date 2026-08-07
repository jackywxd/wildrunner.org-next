/**
 * Create the `race_editions` rows that `race_schedule` implies.
 *
 * WHY THIS EXISTS. The domain-model migration derives editions with one
 * `INSERT ... SELECT` joining `race_schedule` to `race_events`. On any
 * database that already had a schedule — production, staging, a developer's
 * — that is the whole job and this script has nothing to do.
 *
 * CI is the exception, and it is the reason this file exists. There the
 * database starts empty: migrations run first and find no schedule rows, so
 * the migration produces **zero editions**, and the seed that populates
 * `race_schedule` runs afterwards with nothing to re-derive them. Two corpus
 * tests then skipped rather than failed, and the run reported green while
 * asserting nothing about editions at all.
 *
 * So this is the second half of seeding, not a second implementation of the
 * migration: same rule, same source, expressed through the collection layer
 * so field validation and hooks apply.
 *
 * Idempotent by construction — an edition already present for an
 * (event, year) is left alone, which is also what the unique index on that
 * pair would enforce. Safe to run on a database that is already correct, and
 * useful on any environment whose editions have fallen behind its schedule —
 * which `seed-race-schedule.ts` alone does not keep true, because that script
 * writes `race_schedule` only and nothing derives `race_editions` from a new
 * row automatically. Run this after it, every time.
 *
 * THE REMOTE TARGET, EXPLICIT. First written with none of this — a plain
 * `getPayload({ config })` at module scope. `scripts/` scripts count as CLI
 * for `payload.config.ts`'s purposes, so a stray `CLOUDFLARE_ENV` left in a
 * shell would have been enough to point this at a real database with no
 * check at all. `seed-race-schedule.ts` requires an explicit target for
 * exactly this reason; this now does too, the same way — and for the same
 * reason `migrate-velite-to-payload.ts` imports `payload.config` dynamically
 * rather than statically: a static `import config from "../src/payload.config"`
 * is hoisted and evaluated before any of this file's own code runs, which
 * means setting `CLOUDFLARE_ENV`/`NODE_ENV` textually "above" it would still
 * be too late — `payload.config.ts`'s `isProduction`/`isCLI` module-level
 * constants would already have read the *previous* values. So the config
 * import happens inside `main()`, after the target is resolved.
 *
 * `production` becomes *absent*, never passed through: wrangler names the
 * top-level environment by its absence, and `CLOUDFLARE_ENV=production`
 * resolves to nothing (AGENTS.md, "The two environment variables"). Getting
 * this wrong is not hypothetical — a status check that passed it through
 * literally applied a migration to production earlier the same day this file
 * was written.
 */
import { getPayload } from "payload";

const remote = process.argv.includes("--remote");

if (remote) {
  const target = process.env.CLOUDFLARE_ENV ?? "staging";
  if (target !== "staging" && target !== "production") {
    console.error(
      `CLOUDFLARE_ENV must be "staging" or "production", got "${target}".`,
    );
    process.exit(1);
  }
  Object.assign(process.env, { NODE_ENV: "production" });
  if (target === "production") {
    delete process.env.CLOUDFLARE_ENV;
  } else {
    process.env.CLOUDFLARE_ENV = target;
  }
  console.log(`[editions] target: ${target} (remote)`);
} else if (process.env.CLOUDFLARE_ENV || process.env.NODE_ENV === "production") {
  // Ambient env vars left over from a previous remote command in the same
  // shell are exactly the failure mode `--remote` guards against elsewhere
  // in this repo. Refuse rather than silently honour them.
  console.error(
    "CLOUDFLARE_ENV or NODE_ENV=production is set but --remote was not " +
      "passed. Refusing to guess whether this run means the local database " +
      "or a real one — pass --remote to target CLOUDFLARE_ENV explicitly, " +
      "or unset it to run locally.",
  );
  process.exit(1);
}

async function main() {
  // Dynamic, and deliberately after the target is resolved above — see the
  // file header for why a static import here would read the wrong env vars.
  const { default: config } = await import("../src/payload.config");
  const payload = await getPayload({ config });

  const [schedule, events, editions] = await Promise.all([
    payload.find({
      collection: "race-schedule",
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: "race-events",
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: "race-editions",
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
  ]);

  const eventByKey = new Map(events.docs.map((e) => [e.key, e]));
  const seen = new Set(
    editions.docs.map((e) => {
      const event = typeof e.event === "number" ? e.event : e.event?.id;
      return `${event}:${e.year}`;
    }),
  );

  let created = 0;
  // A schedule row whose eventId matches no event is the failure the
  // migration's own guard was written for: a JOIN drops what it cannot match,
  // silently, and the race then never appears in the table everything is
  // about to read. Collected and reported rather than skipped past.
  const unmatched: string[] = [];

  for (const row of schedule.docs) {
    const event = row.eventId ? eventByKey.get(row.eventId) : undefined;
    if (!event) {
      unmatched.push(`${row.name} (eventId=${row.eventId ?? "empty"})`);
      continue;
    }

    const year = Number(String(row.startDate).slice(0, 4));
    if (!Number.isInteger(year)) {
      unmatched.push(`${row.name} (unreadable startDate ${row.startDate})`);
      continue;
    }
    if (seen.has(`${event.id}:${year}`)) continue;

    await payload.create({
      collection: "race-editions",
      data: {
        event: event.id,
        year,
        startDate: row.startDate,
        endDate: row.endDate,
        // Only where the published name differs. An override on every row
        // would be indistinguishable from denormalisation.
        nameOverride: row.name !== event.name ? row.name : undefined,
        location: row.location,
        url: row.url,
        registrationOpensAt: row.registrationOpensAt,
        registrationClosesAt: row.registrationClosesAt,
        registrationUrl: row.registrationUrl,
        registrationType: row.registrationType,
        registrationStatusOverride: row.registrationStatusOverride,
        sourceUrl: row.sourceUrl,
        verifiedAt: row.verifiedAt,
        notes: row.notes,
      },
      overrideAccess: true,
    });
    seen.add(`${event.id}:${year}`);
    created += 1;
  }

  // Counted from the database rather than from the loop. The migration's
  // first guard read the driver's result shape wrongly, logged four
  // `undefined`s and skipped its own check while reporting success.
  const { totalDocs } = await payload.count({
    collection: "race-editions",
    overrideAccess: true,
  });
  console.log(
    `[editions] created ${created}; ${totalDocs} editions for ${schedule.totalDocs} schedule rows`,
  );

  if (unmatched.length > 0) {
    console.log(
      `[editions] ${unmatched.length} schedule rows produced no edition:`,
    );
    for (const row of unmatched) console.log(`[editions]   ${row}`);
    throw new Error(
      `${unmatched.length} schedule rows could not be resolved to an event`,
    );
  }
}

main()
  .then(() => {
    // Booting Payload from the CLI leaves the event loop non-empty. AGENTS.md.
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
