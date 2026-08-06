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
 * useful on any environment whose editions have fallen behind its schedule.
 */
import { getPayload } from "payload";

import config from "../src/payload.config";

async function main() {
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
