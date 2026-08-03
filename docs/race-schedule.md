# Race schedule

The next twelve months of trail races, at `/races`, in list and calendar
views. Admins add and remove races in `/admin`; nothing here needs a deploy.

## The data model, and why it is split in two

There are two collections of race data and they answer different questions.

| | `src/lib/races/catalogue.ts` | `race-schedule` collection |
|---|---|---|
| Answers | *which race is this* | *when does it run* |
| Lives in | code | D1 |
| Changes | almost never | every season |
| Holds | id, series, name, country, distances | dates, registration window, links |
| Read by | finisher badges (`race-records`) | `/races`, homepage teaser |

A catalogue id is written into `race_records.event_id`, so it is immutable:
renaming one orphans every member record pointing at it, degrading their
badge to the neutral placeholder and making the record un-editable. That is
why the catalogue holds no dates — a date is not part of a race's identity,
and putting the two in one place would force a deploy to correct a date.

The two are joined by `race-schedule.eventId`, which is **optional in both
directions**:

- A schedule row with no `eventId` is a perfectly good row. It renders
  normally, just without a badge. This is what makes "add a race in the
  admin panel" real rather than a code change — the catalogue does not have
  to know about a race for it to be scheduled.
- A catalogue entry with no schedule row is fine too; members can still log
  a finish for it.

It also lets the two disagree on purpose. Western States is a UTMB World
Series event and its catalogue id (`utmb-western-states`) says so, but a
schedule row for it may be tagged `others` if that reads better on the page.
The row stores its own `series` rather than deriving it, precisely so
presentation can differ from the badge without renaming anything.

### Series

`RaceSeries` is `utmb | wtm | others`. Add a series by editing
`RACE_SERIES` and `RACE_SERIES_LABELS*` in `catalogue.ts` — every picker,
filter and badge group reads that one list, so nothing else needs touching.
`e2e/races/badge-contract.spec.ts` A-T1 sums over `RACE_SERIES` and will
fail if a series is empty or an id does not match its prefix
(`utmb-` / `wtm-` / `other-`).

## Registration state is derived, never stored

There is deliberately no `isRegistrationOpen` column. A boolean would be
correct on the day it was written and wrong every day after, because nobody
returns to the admin panel to flip it.

`src/lib/races/registration.ts` computes the state from two dates plus the
current time. Both `/races` and `/` are `force-dynamic`, so it is recomputed
on every request and the schedule turns over at midnight with no job
running.

| Condition | State | Shown as |
|---|---|---|
| `registrationStatusOverride` set | `override` | 額滿 / 候補中 / 賽事取消 / 報名資訊待公布 |
| no dates at all | `unknown` | 報名資訊待公布 |
| today < opens | `upcoming` | `M月D日 開放報名` |
| opens ≤ today ≤ closes | `open` | **報名中**（closes 已知時附「至 M月D日」） |
| today > closes | `closed` | 報名已截止 |

Both boundaries are inclusive: a window that opens today is open today, and
one that closes today is still open today. Entrants read "closes 8/28" as
"8/28 is your last day"; being stricter than the organiser would turn people
away a day early.

The override is checked **first**, because "full" and "cancelled" are things
dates cannot express and are exactly what a visitor most needs to see. It is
also the one piece of state that rots — see the maintenance job below.

Only `open` and `upcoming` render a registration link. Sending somebody to a
closed entry form reads as a bug, not as information.

## Dates are strings

Payload stores a `date` field as a full ISO UTC timestamp. Every date
crossing into the site layer is truncated to `"YYYY-MM-DD"` exactly once, in
`mapRaceScheduleEntry` (`src/lib/content.ts`), and a `Date` is never
constructed from it again.

This is not stylistic. A `Date` renders in the visitor's local timezone, so a
race stored as `2026-08-28T00:00:00.000Z` lands in the 8/27 calendar cell for
a visitor in the Americas and the 8/28 cell in Taipei — the same row in two
different places for two people. `"YYYY-MM-DD"` strings also compare and sort
lexicographically in exactly date order, so nothing is lost by never parsing
them.

The `dayOnly` picker on every date field keeps the stored value at midnight,
which is what makes the truncation lossless.
`e2e/public/race-schedule.spec.ts` S-T3 pins a race to the cell whose
`data-date` equals its `startDate`; that test is the timezone regression
guard.

## Calendar

`src/lib/races/calendar.ts` is pure, takes `now` as a parameter (never reads
the clock), and has no React in it — so `e2e/races/calendar-window.spec.ts`
runs it as plain Node. A month grid is always 42 cells so the twelve stacked
month blocks do not jitter in height, and a multi-day event is expanded
across every day it occupies, clamped to 21 days so a mistyped year cannot
paint the whole window solid.

No calendar dependency was added; the grid is Tailwind plus `dayjs`.

> `calendar.ts` imports `dayjs/plugin/utc.js` **with the extension**. Next's
> bundler resolves the extensionless form that `src/store/day.ts` uses, but
> the Playwright specs load this module through Node's ESM loader, which does
> not.

## Editing races in `/admin`

`/admin` → 賽事 → 賽事日程. Admin-only; the collection is hidden from
members entirely (`access.admin`), and members cannot write to
`/api/race-schedule` (pinned by `e2e/races/schedule-api.spec.ts` E-T3).

Fields worth knowing about:

- **報名方式** — `first-come` / `lottery` / `qualifier` / `invitational`.
  Hardrock, Western States and UTMB Mont-Blanc are lotteries; showing only
  「報名中」 for those would mislead, so the type is rendered beside the
  status.
- **狀態覆寫** — only for what dates cannot express. Setting it overrides
  the derived status, so clear it once the race has run. The daily job
  clears stale ones.
- **資料來源 / 最後確認日期** (`sourceUrl`, `verifiedAt`) — maintenance
  metadata, never shown to visitors. Update `verifiedAt` whenever you check
  a row against the official site.

`(eventId ?? name, startDate)` is the natural key; a duplicate is rejected by
`uniqueScheduleEntry`, comparing calendar days rather than timestamps so the
REST API cannot slip one past the day-only picker.

## Data accuracy

**There is no official API for race dates.** UTMB, World Trail Majors and the
independent organisers all publish web pages only, and several return 403 to
automated fetches. Every row is hand-curated and will go stale. Four things
make that manageable:

1. **Provenance per row** — `sourceUrl` and `verifiedAt`. The catalogue puts
   its sources in a file header covering 80-odd entries, which is enough for
   a list that does not expire; a schedule needs it per row.
2. **Empty beats guessed.** A blank registration window renders as
   「報名資訊待公布」, which is true. A guessed one sends somebody to a form
   that closed — the worst thing this feature can do.
3. **Daily audit** — the maintenance job reports rows nobody has verified in
   90 days, rows with no source, and upcoming races with no registration
   info.
4. **The page always points outward.** Every row links to the official site,
   and the page footer says the organiser's announcement wins.

**Scraping is deliberately not done.** With no stable API and a different
page structure per organiser, a scraper breaks silently and writes wrong
dates, which is worse than having none.

### Seeding

```bash
pnpm seed:races:dry     # validate + print the verification checklist
pnpm seed:races         # local D1
pnpm seed:races:prod    # remote; CLOUDFLARE_ENV picks the environment
```

`scripts/seed-race-schedule.ts` holds a starting set covering roughly
2026-08 through 2027-07 across all three series. It is idempotent on
`(eventId ?? name, startDate)`, validates every row with `zod` against the
same invariants the collection enforces, and prints a per-row checklist to
tick off against the official sites. **The seed data is a draft, not an
authority.**

## The daily maintenance job

`POST /api/races/maintenance`, run by
`.github/workflows/race-schedule-maintenance.yml` at 16:05 UTC (00:05
Taipei).

It does **not** exist to keep the page correct — registration state is
derived per request, so the schedule is right with or without it. It exists
for the three things dates cannot fix by themselves:

1. Clears `registrationStatusOverride` on races that have already run.
2. Revalidates `/` and `/races`. Redundant while both are `force-dynamic`,
   and exactly what would keep them correct if either is ever switched to
   ISR — a change nobody would think to pair with a cache bust.
3. Reports data-quality gaps. Never edits anything but the override above.

Authorised by `X-Maintenance-Secret` matching `RACE_MAINTENANCE_SECRET`, or
by an admin session so it can be triggered by hand. Supply the secret as a
**Worker secret**, never at build time:

```bash
wrangler secret put RACE_MAINTENANCE_SECRET --env staging
wrangler secret put RACE_MAINTENANCE_SECRET
```

`scripts/assert-no-secrets-in-bundle.mjs` fails the deploy if it reaches the
bundle. The same value goes in GitHub Secrets for the workflow.

**The secret is optional as far as the site is concerned.** `/races`, the
admin and the registration status a visitor sees all work without it —
that status is derived per request, not written by any job. Without the
secret only this endpoint refuses, with an explicit "not configured" 500,
and `race-schedule-maintenance.yml` fails its run with an `::error::`. It is
therefore in `preflight-production.ts`'s `OPTIONAL` set: a missing cron
secret should not block shipping the feature.

> Not a Cloudflare Cron Trigger: that needs a `scheduled` handler exported
> from the Worker, and OpenNext generates the entrypoint. Wrapping it for one
> daily call is not worth touching the deploy pipeline for. Revisit if a
> second scheduled job appears.

## Deploying

The `race-schedule` table ships as
`src/migrations/20260801_030616_add_race_schedule.ts`. Staging migrates
automatically; **production does not** — `preflight:prod` only checks and
will fail the deploy if anything is pending:

```bash
node scripts/with-env.mjs .env.production pnpm payload migrate
```

Then approve the `production` environment gate. See
[`docs/release-pipeline.md`](./release-pipeline.md).

## Tests

| Spec | Covers |
|---|---|
| `e2e/races/badge-contract.spec.ts` | catalogue consistency, series sums, id prefixes |
| `e2e/races/calendar-window.spec.ts` | window boundaries, 42-cell grids, leap years, multi-day expansion and clamping |
| `e2e/races/registration-state.spec.ts` | every state branch, both inclusive boundaries, override precedence |
| `e2e/races/schedule-api.spec.ts` | access control (members are read-only here), duplicate and date-range rejection |
| `e2e/races/schedule-maintenance.spec.ts` | endpoint auth, stale-override clearing, report contents |
| `e2e/public/race-schedule.spec.ts` | the twelve-month window, calendar cell placement, registration rendering, filters, homepage link |

`scripts/cleanup-staging-test-data.ts` deletes schedule rows whose name
starts with `E2E ` — the specs also clean up after themselves, but that only
runs when they finish.

> Running the full suite locally can produce `SQLITE_BUSY` failures in
> unrelated specs. The dev server accumulates a `workerd` process per
> compiled route and they contend for the same local D1 file. CI runs in a
> fresh container and does not hit it; if you see it locally, kill stray
> `workerd`/`next dev` processes and re-run.
