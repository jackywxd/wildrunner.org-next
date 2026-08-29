import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-d1-sqlite'
import { sql } from '@payloadcms/db-d1-sqlite/drizzle'

/**
 * The six Abbott World Marathon Majors, as catalogue rows.
 *
 * WHY A MIGRATION AND NOT AN IMPORTER. `race-editions` and the qualifier
 * flags each have one (`seed:editions`, `seed:qualifiers`) because those
 * facts change — dates get confirmed, lists get republished — and a
 * migration runs once per environment. Events have no importer at all:
 * `20260805_153543_add_race_domain_model` inserts `seed-data.ts` and that is
 * the only path, so regenerating the seed reaches a *fresh* database and
 * never reaches staging or production. These six are the opposite of
 * editions — Abbott has named the same six races for a decade — so running
 * once is exactly right, and this is the only way they reach a database that
 * has already migrated.
 *
 * THE ROWS ARE INLINE, NOT IMPORTED FROM `seed-data.ts`. That file is
 * regenerated from `data/*.csv` whenever a race is added or corrected, and a
 * migration that reads it would silently change what it does to a fresh
 * database months from now. A migration describes one moment; it has to
 * carry its own copy. `SIX_MAJORS` in `src/lib/races/six-majors.ts` is
 * checked against the seed by U-SIXMAJORS, which is what keeps the two
 * spellings of these keys from drifting apart.
 *
 * EVERY STATEMENT IS SAFE TO RUN TWICE. `next build` collects page data in a
 * pool of workers, each boots its own Payload and applies whatever is
 * pending, and `@payloadcms/drizzle` writes the `payload_migrations` row
 * only after `up()` returns — so every worker enters this migration. See
 * AGENTS.md, "A migration is entered by several processes at once". Here
 * that costs nothing to arrange: `ON CONFLICT DO NOTHING` against the unique
 * indexes the domain model already declares (`race_events.key`,
 * `race_categories(event_id, key)`) makes the second writer a no-op. Note
 * that this is *not* the check-then-act shape that failed before — the
 * database does the deciding, inside the statement.
 *
 * NO EDITIONS HERE, AND NONE WITH A DATE ANYWHERE. `/races` lists editions,
 * not events, so these six stay off a trail schedule while
 * `/members/races` — which reads the catalogue — offers them for recording.
 *
 * "No editions" is not quite the guarantee, and the difference matters:
 * `populateRaceRecordRefs` find-or-creates a `(event, year)` edition for
 * every record a member writes, so the moment somebody logs Boston 2018 an
 * edition row exists. What keeps it off the schedule is that the hook writes
 * *only* event and year — never a date, deliberately, so a member's claim
 * cannot dictate the public calendar — and `getUpcomingRaces` requires
 * `startDate: { exists: true }`.
 *
 * So the thing not to do is not "add an edition"; it is **give one of these
 * a start date**. That single field is what would put the Boston Marathon on
 * 野馬營's race calendar.
 */

type MajorSeed = {
  country: string
  key: string
  name: string
  nameZh: string
  website: string
}

const MAJORS: MajorSeed[] = [
  {
    country: 'JPN',
    key: 'major-tokyo',
    name: 'Tokyo Marathon',
    nameZh: '東京馬拉松',
    website: 'https://www.marathon.tokyo/',
  },
  {
    country: 'USA',
    key: 'major-boston',
    name: 'Boston Marathon',
    nameZh: '波士頓馬拉松',
    website: 'https://www.baa.org/races/boston-marathon',
  },
  {
    country: 'GBR',
    key: 'major-london',
    name: 'TCS London Marathon',
    nameZh: '倫敦馬拉松',
    website: 'https://www.tcslondonmarathon.com/',
  },
  {
    country: 'DEU',
    key: 'major-berlin',
    name: 'BMW Berlin-Marathon',
    nameZh: '柏林馬拉松',
    website: 'https://www.bmw-berlin-marathon.com/',
  },
  {
    country: 'USA',
    key: 'major-chicago',
    name: 'Bank of America Chicago Marathon',
    nameZh: '芝加哥馬拉松',
    website: 'https://www.chicagomarathon.com/',
  },
  {
    country: 'USA',
    key: 'major-new-york',
    name: 'TCS New York City Marathon',
    nameZh: '紐約馬拉松',
    website: 'https://www.nyrr.org/tcsnycmarathon',
  },
]

/**
 * One category each, and its label is `42K` rather than `Marathon`.
 *
 * The badge band renders `${label} ${year}` at font-size 11 inside a 64-wide
 * viewBox, so eight characters plus a year runs off the edge. `42K` is also
 * how this column already spells the road-ish distances it carries (100M,
 * 65K, 21K).
 *
 * `verified` is 0. Nobody has read these events' own sites for this change,
 * and this schema says so with a flag rather than by omission — see
 * `RaceCategories`. The distance is not in doubt; who checked it is.
 */
const CATEGORY_KEY = 'marathon'
const CATEGORY_LABEL = '42K'
const CATEGORY_DISTANCE_KM = 42.195

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  for (const major of MAJORS) {
    await db.run(sql`INSERT INTO \`race_events\`
      (\`key\`, \`name\`, \`name_zh\`, \`series\`, \`country\`, \`website\`)
      VALUES (${major.key}, ${major.name}, ${major.nameZh}, 'marathon',
              ${major.country}, ${major.website})
      ON CONFLICT DO NOTHING;`)
  }

  // The event id is looked up inline, the same way the domain-model
  // migration does it: one extra subquery per row costs nothing against the
  // round trip carrying it, and it cannot go stale between two loops.
  for (const major of MAJORS) {
    await db.run(sql`INSERT INTO \`race_categories\`
      (\`event_id\`, \`key\`, \`label\`, \`distance_km\`, \`order\`, \`verified\`)
      SELECT \`id\`, ${CATEGORY_KEY}, ${CATEGORY_LABEL}, ${CATEGORY_DISTANCE_KM}, 1, 0
      FROM \`race_events\` WHERE \`key\` = ${major.key}
      ON CONFLICT DO NOTHING;`)
  }

  // Poll the end state rather than trusting the statements — AGENTS.md — and
  // count it through the local API rather than by reading a raw result set.
  // The domain-model migration's own header records why: its first version
  // guessed at the driver's return shape, logged four `undefined`s and
  // skipped its own check, which is worse than no check because it is
  // reassuring.
  //
  // This catches the one failure `ON CONFLICT DO NOTHING` cannot report: a
  // category insert whose `SELECT ... FROM race_events` matched no id writes
  // nothing and raises nothing.
  const events = await payload.find({
    collection: 'race-events',
    depth: 0,
    limit: 0,
    pagination: false,
    req,
    where: { key: { in: MAJORS.map((major) => major.key) } },
  })
  if (events.totalDocs !== MAJORS.length) {
    throw new Error(
      `marathon majors: expected ${MAJORS.length} events, found ${events.totalDocs}`,
    )
  }

  // Scoped to these six events, not to the category key alone:
  // `wtm-transgrancanaria` already carries a category called MARATHON, so a
  // bare count would pass while these rows were missing.
  const categories = await payload.count({
    collection: 'race-categories',
    req,
    where: {
      and: [
        { event: { in: events.docs.map((event) => event.id) } },
        { key: { equals: CATEGORY_KEY } },
      ],
    },
  })
  if (categories.totalDocs !== MAJORS.length) {
    throw new Error(
      `marathon majors: expected ${MAJORS.length} marathon categories across the ` +
        `six majors, found ${categories.totalDocs}`,
    )
  }

  payload.logger.info(
    `marathon majors: ${events.totalDocs} events, ${categories.totalDocs} categories`,
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  const keys = MAJORS.map((major) => major.key)
  const keyList = sql.join(
    keys.map((key) => sql`${key}`),
    sql`, `,
  )

  // REFUSES TO RUN once a member has recorded one of these races.
  //
  // `race_records.category_id` is a foreign key with ON DELETE set null, so
  // dropping the events would not error — it would quietly detach somebody's
  // Boston finish from the race it names, and `resolveBadgeEvent`'s fallback
  // would render the bare id on their profile forever. That is data loss
  // wearing a working page. Rolling back is then a decision with a cost, and
  // the person making it should be told the cost rather than discovering it.
  const claimed = await payload.count({
    collection: 'race-records',
    req,
    where: { eventId: { in: keys } },
  })
  if (claimed.totalDocs > 0) {
    throw new Error(
      `marathon majors: ${claimed.totalDocs} race record(s) point at these events — ` +
        `rolling back would orphan them. Remove or reassign those records first.`,
    )
  }

  // By the six literal keys this migration created, never by a `major-%`
  // pattern. AGENTS.md: a fuzzy match in a query returns wrong rows; in a
  // delete it destroys them.
  await db.run(sql`DELETE FROM \`race_categories\` WHERE \`event_id\` IN (
    SELECT \`id\` FROM \`race_events\` WHERE \`key\` IN (${keyList})
  );`)
  await db.run(sql`DELETE FROM \`race_events\` WHERE \`key\` IN (${keyList});`)
}
