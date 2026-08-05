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

### PII in public queries

`posts.owner`, `galleries.owner`, `media.owner` and `authors.owner` are all
relationships to `users`. At depth ≥ 1 Payload populates the whole account —
email, invite state, live session array — behind every card on the page.

Every `select` in `src/lib/content.ts` omits `owner` for this reason; the
header there explains it at length. `posts.raceRecord` adds a second hop
(`→ race_records.owner → users`), so the detail query stops at depth 1.
`P2-T12` and `R-T6` assert the rendered HTML stays clean.

---

## Commands

```bash
pnpm dev                     # Turbopack, ready in ~340ms
pnpm typecheck               # always run this
npx eslint src scripts e2e   # `pnpm lint` OOMs on this repo; CI does not run it
pnpm test:e2e                # full Playwright suite against localhost

pnpm build:staging           # the CI build path — NEVER `pnpm build`
pnpm deploy:staging

pnpm seed:races              # local D1
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

---

## Testing

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
