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

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@wildrunner.test";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "WildRunnerAdmin1!";

/** Everything `migrate:velite` creates that carries an owner. */
const OWNED = ["authors", "posts", "galleries", "media"] as const;

async function main() {
  const payload = await getPayload({ config });

  const existing = await payload.find({
    collection: "users",
    where: { email: { equals: EMAIL } },
    limit: 1,
  });

  const user =
    existing.docs[0] ??
    (await payload.create({
      collection: "users",
      data: { email: EMAIL, password: PASSWORD, role: "admin" },
    }));

  console.log(
    `[seed:e2e] ${existing.docs[0] ? "found" : "created"} ${EMAIL} (id ${user.id})`,
  );

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

    for (const doc of unowned.docs) {
      await payload.update({
        collection,
        id: doc.id,
        data: { owner: user.id },
        overrideAccess: true,
      });
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
