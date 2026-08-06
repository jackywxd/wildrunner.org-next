/**
 * Give CI's freshly seeded database an account, and give the seeded content
 * an owner.
 *
 * Two facts meet here and the result is invisible until a test fails:
 *
 * 1. `getRiders()` selects authors with `owner: { exists: true }` — the rider
 *    directory is a directory of *members*, so an author nobody owns is not
 *    one. See the header of src/lib/content.ts.
 * 2. `setOwner` stamps that field from the authenticated user, and a script
 *    run from the CLI has no authenticated user. So everything
 *    `migrate:velite` creates lands unowned.
 *
 * On CI that made `/riders` an empty page, and `V6` failed looking for a link
 * that could not exist. Locally it passes, because a developer's database is
 * full of e2e residue that does have owners — the exact shape AGENTS.md warns
 * about: a spec that leans on ambient data passes locally and fails in CI.
 *
 * This is a CI seeding script, deliberately separate from the ownership
 * migration on `fix/content-owner-backfill`. That one repairs production data
 * and has to be reversible; this one populates a database that is thrown away
 * at the end of the job.
 *
 * The account is the one e2e/helpers/auth.ts signs in as, so the member and
 * admin journeys still to be written will find it already here.
 */
import { getPayload } from "payload";

import config from "../src/payload.config";

/**
 * Blank means unset. GitHub Actions substitutes a missing secret as an empty
 * string rather than leaving the variable absent, so `??` kept the `""` and
 * this script tried to create a user with no email — which failed the seed
 * step and took all three CI shards down with it.
 */
function fromEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value !== undefined && value.trim() !== "" ? value : fallback;
}

/**
 * Three accounts, not one, and that is the point of this file now.
 *
 * A single-member database cannot express the questions worth asking. Can a
 * member edit somebody else's post? Does a public page leak *another*
 * member's email? What does `/riders` look like with more than one card — the
 * responsive duplicate that made a badge count read 2 instead of 1 hid behind
 * a directory with exactly one rider in it. Every one of those is unwritable
 * against `users=1`, not merely unwritten.
 *
 * The identities are the ones `e2e/helpers/members.ts` already declares, so
 * specs and seed cannot drift apart. Passwords come from the same env-or-
 * fallback pair, and the fallback is published — which is fine here and is
 * refused against a deployed origin by the guard in `e2e/helpers/auth.ts`.
 */
const ACCOUNTS = [
  {
    email: fromEnv("E2E_ADMIN_EMAIL", "admin@wildrunner.test"),
    password: fromEnv("E2E_ADMIN_PASSWORD", "WildRunnerAdmin1!"),
    role: "admin" as const,
    author: { name: "Admin", slug: "admin" },
  },
  {
    email: fromEnv("E2E_MEMBER_EMAIL", "member@wildrunner.test"),
    password: fromEnv("E2E_MEMBER_PASSWORD", "WildRunnerMember1!"),
    role: "member" as const,
    author: { name: "測試會員", slug: "test-member" },
  },
  {
    email: fromEnv("E2E_MEMBER2_EMAIL", "member2@wildrunner.test"),
    password: fromEnv("E2E_MEMBER2_PASSWORD", "WildRunnerMember2!"),
    role: "member" as const,
    author: { name: "測試會員二", slug: "test-member-two" },
  },
];

const EMAIL = ACCOUNTS[0].email;
const PASSWORD = ACCOUNTS[0].password;

/** Everything `migrate:velite` creates that carries an owner. */
const OWNED = ["authors", "posts", "galleries", "media"] as const;

async function main() {
  const payload = await getPayload({ config });

  /**
   * Each account gets an author, linked in both directions.
   *
   * `authors.owner` is what `getRiders()` filters on, and `users.author` is
   * what maps a race record back to a rider — they are different edges and
   * both are needed. Setting only the first leaves a rider in the directory
   * whose badges never appear; only the second leaves the badges resolvable
   * but the rider absent. Both were observed.
   */
  const users: { id: number; email: string; authorId: number }[] = [];

  for (const account of ACCOUNTS) {
    const found = await payload.find({
      collection: "users",
      where: { email: { equals: account.email } },
      limit: 1,
    });
    const user =
      found.docs[0] ??
      (await payload.create({
        collection: "users",
        data: {
          email: account.email,
          password: account.password,
          role: account.role,
        },
      }));

    const foundAuthor = await payload.find({
      collection: "authors",
      where: { slug: { equals: account.author.slug } },
      limit: 1,
      overrideAccess: true,
    });
    const author =
      foundAuthor.docs[0] ??
      (await payload.create({
        collection: "authors",
        data: { name: account.author.name, slug: account.author.slug },
        overrideAccess: true,
      }));

    await payload.update({
      collection: "authors",
      id: author.id,
      data: { owner: user.id },
      overrideAccess: true,
    });
    await payload.update({
      collection: "users",
      id: user.id,
      data: { author: author.id },
      overrideAccess: true,
    });

    users.push({ id: user.id, email: account.email, authorId: author.id });
    console.log(
      `[seed:e2e] ${found.docs[0] ? "found" : "created"} ${account.email} ` +
        `(user ${user.id}, author ${author.id}, ${account.role})`,
    );
  }

  const user = { id: users[0].id };

  for (const collection of OWNED) {
    // `overrideAccess` because there is no request context to authorise
    // against, and `context.skipOwner` is not a thing — `setOwner` simply
    // leaves the field alone when it cannot resolve a user.
    const unowned = await payload.find({
      collection,
      where: { owner: { exists: false } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    });

    // Round-robin, not all to the first account. One member owning everything
    // is the shape that made "can A edit B's post?" unaskable, and left
    // `/riders` with a single card — which is where a responsive duplicate hid
    // long enough to cost an afternoon.
    let next = 0;
    for (const doc of unowned.docs) {
      await payload.update({
        collection,
        id: doc.id,
        data: { owner: users[next % users.length].id },
        overrideAccess: true,
      });
      next += 1;
    }

    // Counted after the writes rather than trusting the loop: this is the
    // number a failing journey would otherwise have to explain.
    const { totalDocs: remaining } = await payload.count({
      collection,
      where: { owner: { exists: false } },
      overrideAccess: true,
    });
    console.log(
      `[seed:e2e] ${collection}: assigned ${unowned.docs.length}, ${remaining} still unowned`,
    );
  }

  await seedRaceRecords(payload, users);
}

async function seedRaceRecords(
  payload: Awaited<ReturnType<typeof getPayload>>,
  users: { id: number; email: string }[],
) {
  /**
   * Distinct completions, one per member, so the directory shows badges that
   * belong to different people. Chosen from the seeded catalogue rather than
   * invented: an eventId with no matching event resolves to nothing and the
   * badge silently disappears.
   *
   * `race-records` is left empty by `db:reset:local` otherwise, which is why
   * the race-report journey has a free race to claim — these deliberately use
   * events that journey does not pick first.
   *
   * `RaceRecords` now validates against `race-events`/`race-categories`
   * directly (`validateRaceCatalogueRef`) rather than through `findRaceEvent`
   * in `src/lib/races/catalogue.ts` — the database is the only authority a
   * write has to satisfy. That retirement is what makes these three pairs
   * simple to pick correctly: before it, the first draft of this file chose
   * `wtm-hk100/ultra`, a World Trail Majors *ranking tier* rather than
   * anything anyone enters, "verified" against the CSV — the wrong source at
   * the time, and the same fabricated shape that put two unresolvable rows
   * into production.
   */
  const RECORDS = [
    { eventId: "other-hardrock", distanceId: "100m", year: 2023 },
    { eventId: "utmb-mont-blanc", distanceId: "ccc", year: 2025 },
    { eventId: "utmb-mont-blanc", distanceId: "occ", year: 2024 },
  ];

  let created = 0;
  for (const [index, owner] of users.entries()) {
    const record = RECORDS[index % RECORDS.length];
    const existing = await payload.count({
      collection: "race-records",
      where: {
        and: [
          { owner: { equals: owner.id } },
          { eventId: { equals: record.eventId } },
          { year: { equals: record.year } },
        ],
      },
      overrideAccess: true,
    });
    if (existing.totalDocs > 0) continue;
    await payload.create({
      collection: "race-records",
      data: { ...record, owner: owner.id },
      overrideAccess: true,
    });
    created += 1;
  }
  const { totalDocs } = await payload.count({
    collection: "race-records",
    overrideAccess: true,
  });
  console.log(`[seed:e2e] race records: created ${created}, ${totalDocs} total`);
}

main()
  .then(() => {
    // Booting Payload from the CLI leaves the event loop non-empty, so a
    // finished script prints its success line and sits there. AGENTS.md.
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
