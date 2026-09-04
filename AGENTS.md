<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 野馬營 — working notes

A Traditional Chinese trail-running site for a Vancouver club. Next 16 App
Router + Payload CMS 3, deployed to Cloudflare Workers through
`@opennextjs/cloudflare`, D1 for content, R2 for media.

**This file is for what has already gone wrong.** Architecture that reads
cleanly from the code is not repeated here — every collection and most
`src/lib` modules carry a header explaining why they are shaped the way they
are, and those are the first thing to read. What follows is the set of facts
that are invisible from the happy path and have each cost real time.

---

## Landmines

### `pnpm build` writes to the production database

`payload.config.ts` requests remote bindings when `NODE_ENV=production`, and
the D1 adapter applies `prodMigrations` on init. A plain `next build`
therefore connects to **production** D1 and runs whatever is pending.

`--env staging` does not save you: it reaches wrangler, not the `next build`
that `opennextjs-cloudflare build` forks. `CLOUDFLARE_ENV` is what that child
process reads. It is set at step level in `.github/workflows/deploy.yml` —
in the repo deliberately, not in the `STAGING_DOTENV` secret, because a
secret cannot be reviewed or diffed.

**Never run `pnpm build` locally.** Use `pnpm build:staging`, and only when
staging has nothing pending.

### D1 has no transactional DDL

A migration that fails midway leaves the tables it already created with no
`payload_migrations` row, and the next run dies on "table already exists".
That half-applied state took production down once.

- **Check everything knowable before the first `CREATE TABLE`.**
  `20260805_153543_add_race_domain_model.ts` validates the whole mapping up
  front for exactly this reason.
- Cleaning up by hand means dropping the columns and indexes the migration
  added to *other* tables too, not only the new tables.
- Generated `down()` drops tables in declaration order. If a child table has
  a NOT NULL foreign key, that order is wrong and the rollback fails on its
  own first statement. Check it.

### A migration is entered by several processes at once

`next build` collects page data in a pool of workers — eleven on the machine
where this first bit — and each boots its own Payload, connects, and applies
whatever is pending. Nothing serialises them: `@payloadcms/drizzle`'s
`runMigrationFile` writes the `payload_migrations` row **after** `up()`
returns, so every worker finds the same migration pending and every one runs
it.

**So DDL has to be safe to execute twice.** Attempt each statement and
tolerate the one error meaning "already applied" — `duplicate column name`
for `ADD COLUMN`, `no such column` for `DROP`. Anything else still fails.

**Checking first cannot work**, however careful the check. Reading
`PRAGMA table_info` and adding only what is missing is the obvious shape and
it is wrong: both workers read before either writes, so both compute the
same missing list and the loser dies. `20260826_072758_add_race_category_qualifiers`
shipped that way and took the staging deploy down with it — its log shows
`race_categories has 12 columns` printed twice, both workers deciding to add
all four columns, and one exiting on `duplicate column name`. D1 has no
transactional DDL, so the winner's columns survived with no ledger row.

**Two `pnpm payload migrate` processes will not reproduce it.** Their startup
jitter dwarfs the window; six of them, tried, and only the first ever entered
the migration. Test the consequence instead — put the columns in place with
no ledger row, which is exactly the losing worker's state, and run the
migration against it.

**The database's complaint is not on the error you catch.** Drizzle's
`.message` is its own summary (`Failed query: ALTER TABLE ...`); the D1 text
sits one or two `cause` levels down. A matcher reading `.message` alone
silently tolerates nothing.

### A row reported as failed may already be written

Same table, same day, DML instead of DDL. `pnpm seed:qualifiers:staging`
reported `failed=1` for `wtm-cape-town/utct` with 400 characters of SQL and
no reason. That run had written it: the row was in the database and correct,
and querying it is what established that — after the failure had already been
believed and acted on.

The statement ends `... returning "id", "event_id", ...`. D1 applied the
update and something on the way back raised; there is **no transaction to
roll it back**, exactly as with DDL. So the client's verdict describes the
round trip, not the write.

- **After a failed row, query that row before doing anything else.** Not
  after re-running — re-running is what makes it unfalsifiable, because a
  second attempt against already-correct data reports `unchanged` and looks
  like the first one never happened.
- The importer's failure line now walks the `cause` chain
  (`scripts/import-race-qualifiers.ts`), so the next one of these says what
  the database actually objected to. This one no longer can: the row matches,
  so no update is issued, and there is no root cause here — only the
  observation and the rule.

### `payload.db.create` does not fall through to the SQL column default

A new column added with a "safe" DDL default does not protect the scripts that
write rows without going through Payload's document layer. Drizzle binds a
column's *declared* default as an INSERT parameter (`withDefault.js` and
`buildDrizzleTable.js` in `@payloadcms/drizzle`, then `buildInsertQuery` in
`drizzle-orm`); it never emits the SQL `DEFAULT` keyword. So the value the
scaffold's `defaultValue` names is what lands, whatever the `ALTER TABLE` said.

That matters because `migrate-velite-to-payload.ts` and
`sync-prod-content-to-staging.ts` both use `payload.db.create` deliberately —
`payload.create` would treat a `url` in the data as a "paste URL to upload"
request. When `media.usage` arrived, leaving it to the field default would have
marked all 126 imported article images as public photo-wall content in the
local corpus and on staging. `ensureMediaFromUrl` now takes it as a **required
parameter with no default**, so each call site has to say which it is.

**A new field with a meaningful default: grep for `db.create` before trusting
it.**

### Merging two version array tables silently eats rows

Payload's array tables come in pairs: `galleries_items` (live, `id text`) and
`_galleries_v_version_items` (versions, `id integer PRIMARY KEY`). Merging two
arrays into one means copying two source tables into each — and the two halves
behave differently, in a way that looks identical until you count.

The live tables carry Payload's own `text` ids, which are unique across both,
so `INSERT OR IGNORE ... SELECT id, ...` is re-entrant and correct. The version
tables number **from 1 in each table**, so their ids collide across almost
every row; the same statement drops each collision without an error. Measured
on the seeded corpus: **200 source rows in, 120 out, 80 lost, exit status 0.**

So a version copy must not carry the id at all — let SQLite assign — and get
its re-entrancy elsewhere. `20260830_090500_merge_gallery_items` uses a
`WHERE NOT EXISTS (... x._parent_id = src._parent_id)` correlated inside the
one INSERT, which is the "database decides inside the statement" shape rather
than the check-then-act one.

Two more things from that migration worth keeping:

- **`_order` has to be recomputed, not copied.** Each source table numbers from
  1 within a parent, so a plain union puts two rows at `_order = 1` in the same
  album — and Payload sorts the array by that column, so the album's order
  becomes whatever the planner returns.
- **Expand, never expand-and-contract in one file.** The old tables are left in
  place and dropped by a later migration in a later PR. With no transactional
  DDL and several build workers in the same file, worker A's `DROP` can land
  while worker B is still copying; and it makes `down()` a plain drop of what
  was created, with nothing to reconstruct.

### `db:reset:local` seeds nothing about one run in four

`pnpm migrate:velite` — the step that imports the 15 posts, 20 galleries and
546 media rows — sometimes writes nothing, prints nothing and exits **0**. The
reset then reported success over an empty database, and the browser suite ran
against a corpus nobody built: the condition this file already describes as
un-diagnosable, where results degrade in ways that look like anything except
the data.

Measured 2026-08-30 over four consecutive resets — **one failed, three
passed** — after PR #93 had recorded an earlier occurrence as "only happened
once, did not reproduce".

**The failing child dies inside wrangler's own startup.** Its entire output is
the `Proxy environment variables detected` warning, and then nothing: it never
reaches the `Using secrets defined in .env` line that every healthy run prints
next, so `main()` never runs. No output, no rows, status 0, under five
seconds. That is the signature of a top-level `await` that never settles with
nothing left on the event loop — `payload.config.ts` acquires its Cloudflare
context in a top-level await, so module evaluation is what hangs, and Node
exits cleanly once the loop empties.

What it is **not**, each ruled out by measurement rather than argument:

- **Not the stdio or env the reset passes.** Invoked through an `execSync`
  that copies both exactly, it works.
- **Not workerd contention over the just-deleted D1 directory.** `pgrep
  workerd` was sampled every second across the failing run and the count was
  **0** while the step ran — it never got as far as creating a miniflare.
- **Not a later step deleting the rows.** `seed-e2e-account.ts` contains no
  delete, and the failing run's log shows the import never printed anything.
- **Not an error.** Every failure path in that script prints and exits 1.

The cause is still open. The silence is not: the reset reads its row counts
back with `wrangler d1 execute --local` and exits non-zero naming the empty
table and the step that should have filled it. Re-running the step alone has
worked every time.

**Two things that guard learned the same day, both by being run rather than
read.** `execSync` goes through `/bin/sh`, so backticks quoting a table name
are command substitution and the name vanishes from the SQL; and D1's SQLite
is built with a low `SQLITE_MAX_COMPOUND_SELECT`, so six `UNION ALL` terms
come back as "too many terms in compound SELECT". Count rows with one
`SELECT (SELECT COUNT(*) FROM t) AS t, …` instead.

### Moving route files kills the dev server, and the tests blame the tests

Moving `(site)` under a `[lang]` segment — 51 files, no code change — left
Turbopack's incremental cache in `.next` holding the *old* route tree. The
next `pnpm dev` came up, served pages for a while, and then took a **`FATAL`
panic naming a path that no longer exists**:

```
FATAL: An unexpected Turbopack error occurred.
Failed to write app endpoint /(site)/(public)/page
Cell ... "next_core::app_structure::AppPageLoaderTree" ... no longer exists
  in task ... directory_tree_to_loader_tree
```

**The symptom is dozens of unrelated red specs, not a compile error.** The
server was already dead when the browser lane reached it, so 47 of 76 tests
failed with `WebSocket is already in CLOSING or CLOSED state` from the HMR
client — an error about the test's own page, in tests that have nothing to
do with routing. Two hypotheses were reached for and paid for before the
server's own log was read: a stale database (real, and separately worth
fixing — the local D1 was two migrations behind the code) and a regression
in the move. Neither produced those numbers.

- **`rm -rf .next` after any route move, before the next `pnpm dev`.** Not
  when it looks broken.
- **Then check `pgrep workerd`.** Killing the panicked server orphaned one,
  which is the contention this file already documents.
- And the general rule this file already states, broken again here: *read
  the server's own log before forming a hypothesis.* `grep -c FATAL` on the
  dev log answers in a second what two re-runs did not.

### Closing a PR does not revert the database

Schema reaches D1 during a *build*, so it survives a discarded branch. PR #25
left `posts.race_record_id` and a `20260804_213708_add_post_race_record` row
in `payload_migrations` on both databases while the file went away with the
branch.

Before regenerating a migration for reverted work, query
`payload_migrations` on both databases. If the old name is still there,
rename the generated `.ts` **and** `.json` to match — existing databases then
skip it, a fresh one applies it.

### Version lock

`@payloadcms/next` supports **nothing between Next 15.5.0 and 16.2.2**. This
project ran 15.5.20 — outside every supported range — for weeks, while the
dev server misbehaved and the symptoms were worked around in tests instead.

- All five `@payloadcms/*` packages move together, matching `payload`.
- `next dev` uses Turbopack; **the production build opts back out with
  `--webpack`**, because Turbopack rewrites the specifier
  `@payloadcms/drizzle` uses to reach `drizzle-kit/api`, and OpenNext's
  esbuild pass then cannot resolve it. `serverExternalPackages` does not
  prevent this. Details in `docs/next-16-upgrade.md`.
- **When a tool misbehaves twice, check peer ranges before writing the second
  workaround.**

### Test credentials are published, and staging is on the internet

`e2e/helpers/auth.ts` carries a fallback password. **This repository is
public**, so that fallback is readable by anyone — which is fine for a
database created and destroyed inside a CI job, and was not fine for
`deploy.yml`, which ran the same suite against the staging Worker while
setting no `E2E_ADMIN_PASSWORD`.

Staging answers `/`, `/admin` and `/members/login` with 200 to anyone. So
every deploy signed in to a publicly reachable site with a credential anybody
could read, and the job succeeding *was* the proof that it worked. Nothing had
to be guessed.

What kept it small was already deliberate: `sync-prod-content-to-staging.ts`
keeps `users` out of staging — its header names this very constant as the
reason — so no real email or hash was ever there, and staging's
`RESEND_API_KEY` is empty, so it cannot mail anyone.

- The guard in `auth.ts` refuses a **published password against a non-local
  origin**. Removing the fallback would only mean the next person adds one
  back; making the unsafe *combination* fail loudly is what cannot be
  reintroduced quietly.
- Wiring the secret is half the fix. **The password on the deployed
  environment has to be rotated too** — otherwise the published one keeps
  working whether or not this suite uses it.
- The general rule: **before pointing a test suite at a deployed origin, ask
  what it authenticates as and where that credential is written down.** A
  fixture that is harmless in a disposable database is a public login the
  moment the target is public.

### The two environment variables

Read this before running anything that touches a deployed database. Every
statement below is from the source named beside it, not from inference — this
pair has caused repeated production-adjacent mistakes, including a migration
applied to production by a command that looked read-only.

**They answer different questions and neither can replace the other.**

| | question it answers | defined by |
|---|---|---|
| `NODE_ENV` | build/runtime mode | Node/Next |
| `CLOUDFLARE_ENV` | **which Cloudflare resources to bind** | wrangler itself — it is the env-var form of `-e/--env` (three references in `node_modules/wrangler/wrangler-dist/cli.js`) |

`wrangler.jsonc` defines:

```
top level    → D1 wildrunner-org-next           ← production
env.staging  → D1 wildrunner-org-next-staging
```

Both are `NODE_ENV=production` builds. They are the same code in the same
mode, differing only in which database they bind, so `NODE_ENV` cannot express
"production build against staging's data". That is what the second variable is
for.

#### `CLOUDFLARE_ENV=production` is invalid, and always has been

**wrangler names the top-level environment by its absence.** There is exactly
one `env` section — `staging` — so `production` resolves to nothing:

```
UserError: No environment found in configuration with name "production".
  The available configured environment names are: ["staging"]
```

- staging → `CLOUDFLARE_ENV=staging`
- production → **unset**

Nobody chose this asymmetry. `payload.config.ts` reads the variable because
the scaffold commit copied the pattern from the OpenNext adapter's own source
(`e30726d`, and the "Adapted from" link is still in the file); `env.staging`
arrived three days later (`f22717f`) and made "production has no name" a fact
nobody wrote down.

`.env.production` **must not set it.** It did, and because
`scripts/with-env.mjs` deliberately overrides pre-existing `process.env`
entries, unsetting it in the shell does not help. Two scripts translate
`production` to absent on purpose — `seed-race-schedule.ts` and (since this
was found) `migrate-velite-to-payload.ts` — so `pnpm seed:races:prod` is
correct even though it *sets* the invalid value.

#### `NODE_ENV=production` applies migrations. On connect. To whatever it is bound to.

`node_modules/@payloadcms/db-d1-sqlite/dist/connect.js:52`:

```js
if (process.env.NODE_ENV === 'production' && this.prodMigrations) {
    await this.migrate({ migrations: this.prodMigrations });
}
```

So **booting Payload with `NODE_ENV=production` runs every pending migration**,
whatever subcommand followed. `payload migrate:status` is not a read: it
connects first, and connecting is the write.

That is how `20260805_153543_add_race_domain_model` reached production —
a status check, run to *confirm* what was pending.

**There is no way to inspect a deployed database's migrations by booting
Payload.** Query it instead, which touches nothing:

```bash
npx wrangler d1 execute wildrunner-org-next --remote \
  --command "SELECT name, batch FROM payload_migrations ORDER BY id DESC LIMIT 5;"
```

`scripts/preflight-production.ts` already works this way, and says why in its
header.

### PII in public queries

`posts.owner`, `galleries.owner`, `media.owner` and `authors.owner` are all
relationships to `users`. At depth ≥ 1 Payload populates the whole account —
email, invite state, live session array — behind every card on the page.

Every `select` in `src/lib/content.ts` omits `owner` for this reason; the
header there explains it at length. `posts.raceRecord` adds a second hop
(`→ race_records.owner → users`), so the detail query stops at depth 1.
`P2-T12`, `R-T6` and `V-LIBRARY-T1` assert the rendered HTML stays clean.

The gallery media query was the one query in that file with no `select` at
all — safe only because it also ran at depth 0. It carries one now
(`GALLERY_MEDIA_SELECT`), which matters more since `media.usage` replaced
`raceEdition exists`: the same query went from returning nothing on a seeded
database to returning every public upload.

---

## Rules that override convenience

Five, learned the expensive way — four on 2026-08-06 and one on 2026-08-30.
Each is also enforced or documented somewhere concrete, because a rule only in
prose is a rule that decays.

**Destructive work is proposed, never performed.** Deletes and drops on any
database *including local*, migrations against a deployed environment,
`git reset --hard`, force-push, branch deletion, stopping a server somebody is
using. Produce the commands in order, name the irreversible step, hand them
over. If a task cannot continue without one, stop and report the state — an
unfinished task is recoverable, a destroyed one is not.

**A deployed database is not touched until there is a way back, and staging is
not a rehearsal unless it carries production's rows.** Two halves of one
requirement, and on 2026-08-30 a merge was one click away with neither of them
established — the merge alone would have applied two migrations to staging,
because `deploy.yml`'s first job is `payload migrate`.

- **Record the restore point before the schema change, not after.**
  `wrangler d1 time-travel info <db>` prints a bookmark and the window it can
  reach; that is the fast way back, and no row leaves Cloudflare.
  `wrangler d1 export <db> --remote --output prod-backup-$(date +%Y%m%d).sql`
  is the slow one, for when that window does not cover it —
  `docs/production-cutover.md` says "**先做这一步**" and then explains why it is
  slow: the dump's INSERTs come before the CREATEs and `users` ↔ `authors` is a
  circular foreign key, so restoring it is a reconstruction, not one command.
  **That file never enters git or a workflow artifact.** This repository is
  public and the dump carries real emails and bcrypt hashes — the same reason
  `sync-prod-content-to-staging.ts` refuses to copy `users` at all.
- **Nothing in this repository backs anything up on a schedule.** All five
  workflows were checked; none does. So "there is a backup" is never an
  assumption, only an observation you just made.
- **A migration on staging rehearses production only if staging holds
  production's data.** `pnpm sync:staging` closes the gap one way — published
  content only, no `users`, no drafts, no R2 bytes. Compare the row counts on
  both databases first (one row of subqueries; D1's `SQLITE_MAX_COMPOUND_SELECT`
  is too low for a `UNION ALL` per table), and read the migration's own output
  afterwards. Those numbers are the only evidence the change survives real data.
- Reading a deployed ledger is `wrangler d1 execute --remote --command "SELECT
  name, batch FROM payload_migrations …"`. **Never `payload migrate:status`** —
  connecting with `NODE_ENV=production` is the write, as the two-environment-
  variables section above records.

**Never delete by `like`, prefix, or any pattern.** Only by ids captured when
the rows were created. A fuzzy match in a query returns wrong rows; in a delete
it destroys them. Twenty rows titled `"P2 PII Probe"` were lost here to a
cleanup meant to remove one. If an id was not captured, the row is not yours to
delete — say so.

**Read the schema before testing a form.** Pair every required field with the
control that fills it, *before* clicking anything. A required field with no
control is a bug by construction, and no UI-driving test can see it because the
test cannot do what the user cannot. `pnpm assert:schema-screen` enforces this
for every member-facing form; `docs/member-publish-flow.md` shows what the
pairing found.

**Do not write new code to diagnose.** Every probe, guard and cleanup written
to investigate something that day was wrong on its first version, and a broken
probe fails silently — silence then reads as "no problem". Read what already
decides the behaviour: the collection, the vendor source in `node_modules`, the
config, the migration. When reading is not enough, use tools that already work
— `wrangler d1 execute --remote`, the server log, `payload_versions`, git,
Playwright codegen. Not something written five minutes ago.

## Commands

```bash
pnpm dev                     # Turbopack, ready in ~340ms
pnpm typecheck               # always run this
npx eslint src scripts e2e   # `pnpm lint` OOMs on this repo; CI does not run it
pnpm test:unit               # the unit lane: no server, no database, ~6s
pnpm test:e2e                # browser + contract lane, against localhost
pnpm db:reset:local          # rebuild local D1 into the corpus CI seeds — run
                             # this BEFORE test:e2e, every time, not when it
                             # looks broken. Prints the counts it read back;
                             # about one run in four seeds nothing and now
                             # fails loudly — see Landmines

pnpm build:staging           # the CI build path — NEVER `pnpm build`
pnpm deploy:staging

pnpm seed:races              # local D1
pnpm seed:qualifiers         # WS/Hardrock qualifier flags from the CSV (:staging, :prod)
pnpm validate:catalogue      # gates the race CSVs before import
pnpm seed:catalogue          # regenerate src/lib/races/seed-data.ts from data/*.csv
pnpm capture:badges          # every badge the site renders, as JSON, for diffing
```

`PLAYWRIGHT_BASE_URL` / `BASE_URL` point the e2e and capture commands at a
deployed environment.

---

## Race data

The catalogue is **reviewed CSV under `data/`** — not code, not hand-written
SQL. `docs/race-data-sources.md` is the full account; the short version:

- Every row carries `source` (the URL it was read from) and `verified_at`
  (the day somebody read it). **Empty means never.** Do not bump a date for a
  row you did not actually re-check — the staleness report is worth nothing
  if the dates are not true.
- `verified=no` on a category means the line-up was assumed. Assumed has been
  wrong *every time* it was checked: no UTMB World Series event runs
  20K/50K/100K/100M, and World Trail Majors' "Ultra/Short" are ranking tiers,
  not what you enter.
- Facts decay at different rates. Series membership changes **yearly** —
  宁海 was mainland China's first UTMB stage in 2023 and had left by 2026.
- The event `key` is immutable and environment-stable, and that is
  load-bearing: badge colour is `hash(event.key)`, so an integer id would
  give staging and production different colours for the same race.
- Refresh tooling **reports differences for a human to accept**. Never
  scrape-and-write: no organiser publishes an API, every page differs, and a
  silently-broken scraper writes wrong dates — worse than having none.
- `data/race-editions.csv` is the third reviewed CSV, and the only one meant
  to be refreshed regularly rather than reviewed once. `pnpm seed:editions`
  (`scripts/import-race-editions.ts`) upserts it into `race-editions` by
  `(event, year)` directly — never through a migration, because editions
  change weekly (dates confirmed, registration windows opening and closing)
  and a migration only ever runs once per environment. It never overwrites a
  row the database has verified more recently than the CSV, so an admin's own
  edit in `/admin` survives the next import untouched.

---

## Testing

**`docs/testing-strategy.md` decides what gets a test and at what level;
`docs/testing-plan.md` is the suite that follows from it.** Read those before
adding one. The short version: a test covers a user's use case, our own logic,
or our configuration of a framework — and nothing else. ~60% of the suite as
measured was none of those, and it is being removed.

`scripts/assert-test-strategy.mjs` enforces the mechanical rules in CI, because
this file already carried rules that were broken repeatedly in one session.

The incidents below are what those documents were written from.

~270 tests, and three structural blind spots. Two are now covered; the shape
of all three is worth carrying.

- **Tests navigate with `goto`; users click.** The calendar-toggle bug lived
  entirely in soft navigation and was invisible by construction.
  `e2e/navigation/click-paths.spec.ts` arrives by clicking; anything
  reachable by a link needs one test that does.
- **A health check must touch the database.** `/` and an unauthenticated
  `/admin` render without it, so a deploy once 500'd every dynamic route
  while smoke stayed green. `P0-T6` signs in and loads a page that queries.
- **Specs assert on fixtures they created** — right for isolation, but it
  means nothing notices the corpus itself is wrong. Five schedule rows sat
  with no `eventId` for weeks under 250 green tests. `e2e/corpus/` asserts
  about the data that is actually there.

Two rules that came out of getting these wrong:

- **An assertion is only worth having once it has been seen to fail.** Break
  the thing deliberately, watch it go red, restore. The first version of the
  domain-model migration guard read the driver's result shape wrongly, logged
  four `undefined`s, and skipped its own check while reporting success.
- **Local D1 is e2e residue**, not realistic data — hundreds of `dupe-*`
  accounts, `race_records` often empty. A spec that leans on ambient data
  passes locally and fails in CI, where the database starts empty.

  `pnpm db:reset:local` is the fix and it belongs *before* the run, not after
  a confusing one. Eight consecutive suite runs were made here against a
  database nobody rebuilt: it drifted from the seeded 15 posts to 22, and the
  results degraded monotonically — 40 passed/2 failed, then 21/21, then
  16/26. Three explanations were reached for and each was wrong (orphaned
  processes, a corrupted corpus, a degraded machine); the corpus specs passing
  12/12 is what finally ruled out the data, and CI — which rebuilds per shard
  — disagreed with all of it. **A local browser-suite result from an un-reset
  database is not evidence of anything.**

- **A dynamic segment is its own compilation unit.** `e2e/helpers/warmup.ts`
  claimed detail routes "share a compiled route with their index"; they do
  not, and each costs ~5s to compile on a cold server. That was invisible
  while all 42 browser tests ran in one shard, because some earlier test
  always happened to pay it. Sharding removed the accident and dropped the
  compile inside `P-PHOTO`'s 20s budget, which is how it failed on CI while
  passing locally. Anything a spec reaches — `/members/media`,
  `/races/<key>/<year>` — has to be in that ROUTES list by name; an index
  does not cover its children.

### A page that logs errors is not a page that works

The suite had 257 tests and **one** of them looked at the console. That is how
a hand-written `<html>` wrapper in `src/app/(payload)/layout.tsx` nested a
second `<html>` inside `<body>` on *every* admin page — React remounted html
and body, hydration failed, the whole admin tree was rebuilt client-side —
while 250 tests stayed green. Assertions that ask "is this text present"
cannot see a page that is screaming.

Browser specs import `test` from `e2e/helpers/test.ts`, whose automatic
fixture fails the test on any `pageerror` or `console.error`. API-only specs
keep importing from `@playwright/test`: the fixture depends on `page`, so
importing it there would launch a browser for nothing.

Anything added to that file's ignore list is a class of error the suite can no
longer see. The bar is "the app cannot cause it and cannot stop it", never
"this is currently failing".

---

## Workflow

- **Test in dev before opening a PR.** Walk the real path on `pnpm dev` — log
  in, click it, save, reload. "It compiles" is not the claim being made.
- **Deployed is the only done.** Nothing a commit changes is observable until
  `deploy:staging` has run *and* that environment's migration ledger has
  caught up. Name the environment and the check.
- **After a production incident, restore first and report.** Adding
  prevention mid-incident turned one incident into three: a guard in the
  wrong branch never ran, then the same guard fired inside the Worker and
  500'd every dynamic page.
- **When the real scope is bigger than the request, stop and ask.** "Fix the
  15 unowned posts" turned out to be 582 rows across six tables. The migration
  was written, applied and *then* reported — which looks like reporting but
  is not, because nobody got to say no. It matters most when the change cannot
  be undone: that migration's `down()` cannot tell the rows it assigned from
  ones a member has owned since. Every unstated choice that decides what gets
  written — which account, which tables, whether it is reversible — is the
  user's, not the agent's. Do the part actually asked for if it stands alone,
  and put the rest as a short list of choices.
- **Read the server's own log before forming a hypothesis.** `next dev` had
  been printing `In HTML, <html> cannot be a child of <body>` dozens of times
  while a whole session was spent blaming a Payload i18n regression, writing a
  `beforeChange` hook for a cause that had never been established. The server
  was started detached and treated as a black box that either returned 200 or
  did not. If it is running, its output is the first evidence, not the last.
- **A probe must be able to report both outcomes.** `curl | grep '<html lang'
  | head -1` returned `en` under every condition tried — because the page had
  *two* `<html>` elements and `head -1` read one that was hardcoded. The
  invariance read as strong evidence when it meant the instrument was
  disconnected. Count the matches (`grep -c`, `getElementsByTagName().length`)
  and force the other answer once before trusting a probe. Same hour, same
  mistake: grepping served HTML for Chinese text matched the inlined
  translation bundle, not rendered chrome.
- **Retries are not a fix, and neither is the first plausible cause.**
  `SQLITE_BUSY` was making CI red at random. `experimental.cpus = 1` was the
  obvious answer and it was *measured*, not assumed — it changed nothing (12
  worker children either way). Instrumenting the actual call site found the
  real mechanism: `next dev` runs app code in a pool of jest-worker child
  processes, and `payload.config.ts` called `getPlatformProxy()` in each of
  them, so every worker booted its own miniflare over the same SQLite file.
  Routing dev through `getCloudflareContext()` — the single instance
  `initOpenNextCloudflareForDev()` already starts — took it to zero. Raising
  `retries` would have hidden this forever.

  It came back on 2026-08-26, and the reason is worth carrying: that reuse
  only ever worked in the process `initOpenNextCloudflareForDev` runs in.
  `next dev` forks a **fresh child process per dynamic route** to ask it for
  `generateStaticParams` (`next/dist/server/dev/next-dev-server.js`,
  `getStaticPathsWorker` — "we don't re-use workers so destroy the used one"),
  and that child's global scope is empty. `getCloudflareContext` then falls
  back to wrangler itself with *no* options, so it asks for the `remote: true`
  bindings `wrangler.jsonc` declares; with no credentials that handshake fails
  after seconds, and the catch in `payload.config.ts` answered with a second
  miniflare over the same local SQLite file. Two `workerd` per fork, 40 of
  them in one CI shard, `database is locked` on the `/gallery` media query,
  and a red `V-RACEALBUM-T1` that passed on re-run. The fix is that outside a
  production build the config goes straight to local emulated bindings —
  the remote handshake only ever made sense for `build:staging`/`build:prod`.

  **That fix removed the failed handshake, not the second miniflare, and this
  paragraph read as though it had removed both.** `getRuntimeContext()` reuses
  a *parked* context when one exists and otherwise calls `getPlatformProxy()`;
  a forked child's global scope is empty, so it never has a parked context and
  always builds its own miniflare. Going "straight to local emulated bindings"
  is what that call *is*. So the fork got faster — seconds of doomed handshake
  removed — while still opening a second workerd over the file the dev server
  is serving from. Measured 2026-08-30 on `/posts/[...slug]`, whose
  `generateStaticParams` is legitimate (it is not force-dynamic; its answer is
  prerendered and invalidated by `revalidatePosts`, so the rule below does not
  reach it): `generate-params: 6.3s` on first navigation, and `pgrep workerd`
  going 2 → 3 and *staying* there. `/about` in the same loop stayed flat.

  Short-circuiting that route's `generateStaticParams` in dev removes the
  query and the 6.3s. It does **not** remove the miniflare: `payload.config.ts`
  acquires the context in a top-level `await`, so importing the module is what
  boots it, whichever branch the function then takes. Measured after the
  short-circuit landed — still 2 → 3.

  **Do not reach for a lazy binding to fix that.** `@payloadcms/db-d1-sqlite`
  stores `args.binding` at construction and dereferences it *synchronously* at
  connect (`connect.js`: `let binding = this.binding`, then `drizzle(binding)`),
  while acquiring it is async. A Proxy cannot bridge that, and the file it
  would live in is the one that decides which database everything talks to.

  What is left is to stop the fork existing: a dynamic route with no
  `generateStaticParams` export is never asked for one. For `/posts/[...slug]`
  that means dropping build-time enumeration and letting posts render on first
  request into the R2 incremental cache — which is *not* the same as making
  the route `force-dynamic`, and which the tag cache already invalidates
  correctly. It changes what production serves, so it needs a real build and a
  staging check before it lands; it was deliberately not done blind.

  **Killing `next dev` orphans its `workerd`.** It reparents to init and keeps
  `.wrangler/state/v3/d1` open, so restarting the dev server a few times
  silently accumulates miniflares over one SQLite file — three of them during
  one measurement here, which is the contention above, self-inflicted. Check
  `pgrep workerd` after stopping the server, not just the port.

  Two things generalise. **A route that is `force-dynamic` must not export
  `generateStaticParams`**: Next asks for it anyway, in that forked child, and
  throws the answer away — `/gallery/[slug]` was paying `generate-params: 2.1s`
  and a whole `getPublishedGalleries()` for nothing. And **the warning that
  fires forty times a run is not a warning**; it read as expected CI noise for
  weeks while it was the count of miniflare instances fighting over one file.
- **Poll the end state, not the process.** Seed and migration scripts finish
  their writes long before they exit; query the rows.
- **A `scripts/` file must end in `process.exit()`.** Booting Payload from the
  CLI leaves something on the event loop, so a script that has finished its
  work still never returns — it prints its success line and then sits there.
  That looks exactly like a hang, and cost ten minutes of waiting on a write
  that had already landed.

  Measured, because the first explanation was wrong: it hangs with `pnpm dev`
  running *and* with it stopped, so this is not the local-D1 contention
  `payload.config.ts` documents. And it is not universal —
  `migrate-velite-to-payload.ts` has no success-path exit and `--dry-run`
  returns fine, so a script that happens to exit today is not evidence the
  next one will. Add the `process.exit()`; do not reason about whether this
  particular script needs it.
- **Run the whole suite before pushing, not just the specs you touched.**
  Making `eventId` required broke fifteen existing tests, and CI found it.

---

## Conventions

- **Dates are `"YYYY-MM-DD"` strings compared lexicographically.** Never
  construct a `Date` from a stored value: a race stored at UTC midnight lands
  on the previous day for anyone west of Greenwich, so two visitors would see
  the same race on different days. `now` is always a parameter so tests can
  control it. See the header of `src/lib/races/calendar.ts`.
- **Comments explain why, not what.** The existing headers are long because
  the reasoning is the part that decays. Match that density rather than
  stripping it.
- **Traditional Chinese for user-facing copy**, English for code and
  comments.
