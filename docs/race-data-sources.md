# Race data: where it comes from, and how it goes stale

Every race fact on this site is copied by hand from a web page. **There is no
API for any of it** — UTMB, World Trail Majors, ITRA and every independent
organiser publish HTML only. So this data is not a fixture that gets loaded
once; it is a snapshot of pages that change, and it is wrong the moment
nobody looks at it again.

This document records what the sources are, how fast each kind of fact
decays, and the mechanism for noticing.

---

## The four kinds of race fact, and how fast each rots

| Fact | Lives in | Changes | Consequence of being stale |
|---|---|---|---|
| **Event identity** — name, country | `race_events` | Rarely. A rename every few years. | Cosmetic; the badge id never changes, so history survives a rename |
| **Series membership** — utmb / wtm / others | `race_events` | **Yearly.** Races join and leave. | A race is filed under the wrong series and a filter hides it |
| **Categories** — which races you can enter | `race_categories` | Every year or two. Distances get added, dropped, renamed. | **A member records a finish in a category the race never ran** |
| **Editions** — dates, registration windows | `race_editions` | **Every year, and registration far more often than that.** | Somebody misses an entry window, which is the worst thing this feature can do |

The bottom two rows are why `verified_at` exists on both the CSVs and the
schedule rows: a date is the only thing that distinguishes "checked and
still true" from "nobody has looked since 2026".

---

## Sources, by data class

### Event identity and series membership

- **UTMB World Series** — the official season calendar, republished each
  autumn. `https://utmb.world/` and the summary at
  `https://theultrarunner.com/utmb-world-series-calendar-<year>/`.
  Membership genuinely moves: Ningbo's **宁海越野挑战赛 withdrew from the
  series before 2026** after being mainland China's first UTMB stage in 2023,
  which is why it is filed under `others` and not `utmb-`.
- **World Trail Majors** — `https://worldtrailmajors.com/`.
- **Independent races** — each event's own site. There is no list, which is
  why this section of the catalogue grows by somebody noticing a gap. The
  British Columbia races were added exactly that way: Fat Dog 120, Knee
  Knacker, Frosty Mountain, Meet Your Maker and Black Spur are what a
  Vancouver club actually runs, and none of them was here.

### Categories

**The event's own site is the only trustworthy source.** Two shortcuts were
tried and both were wrong:

- Assuming UTMB World Series events all run 20K/50K/100K/100M. They do not.
  Checked against their own sites: Tarawera runs TMiler/T102/T50/T21/T14,
  Lavaredo runs 120K/80K/50K/20K/10K, Whistler runs 100K/50K/25K/10K. The
  four-category assumption was wrong for every event checked.
- Assuming World Trail Majors events run "Ultra" and "Short". Those are the
  series' **ranking tiers**, not what you enter. Cape Town runs
  UTCT/UT100/PT55/TM35/EX23/KS16; Transgrancanaria runs ten races.

Where to look:
- UTMB events: `https://<slug>.utmb.world/` — the slug is usually the event
  id minus the `utmb-` prefix, but not always (`utmb-mont-blanc` →
  `montblanc.utmb.world`). Each site lists every race with distance and
  elevation gain.
- Everything else: the event's own site.
- **ITRA** is the best cross-check: it certifies distance, elevation and
  ITRA points for every race. **Use the race pages, not the calendar.**
  `https://itra.run/Races/RaceCalendar` is JavaScript-rendered and returns
  no races as HTML; `https://itra.run/Races/RaceDetails/<id>` is plain HTML
  and fetches fine. Find the id through a search engine, then record it in
  `itra_url` — that is what makes the cross-check repeatable next year.
  **Event names should match ITRA's**, which is what makes a race findable
  there at all.

  Community tooling, if a bulk pass is ever needed:
  [ScrapITRA](https://github.com/ricfog/ScrapITRA) (Python, open source,
  the practical option) and [sportic/itra-client](https://github.com/sportic/itra-client)
  (PHP). ITRA publishes no documented API.

### Editions

Each event's own site, recorded per row in `source_url`. Never a third-party
aggregator for dates — they lag, and a wrong date here sends somebody to a
closed entry form.

Rows live in `data/race-editions.csv`, the third reviewed CSV, imported into
`race-editions` with `pnpm seed:editions`
(`scripts/import-race-editions.ts`) — see AGENTS.md's "Race data" section for
why this one is upserted, not migrated, and never overwrites a row the
database has verified more recently than the CSV.

---

## Why this is not scraped

`src/collections/RaceSchedule.ts` states the rule and it applies to the whole
of this data: **with no stable API and a different page structure per
organiser, a scraper breaks silently and writes wrong dates, which is worse
than having none.**

The refresh tooling therefore **reports differences for a human to accept**.
It never writes. A page that changes shape produces an empty diff or a
nonsense one, and either is visible — where a scraper would quietly overwrite
a correct row with garbage.

---

## The mechanism

### Continuous — the daily maintenance job

`src/endpoints/raceScheduleMaintenance.ts` already runs daily and reports:

- editions whose `verifiedAt` is more than 90 days old
- registration overrides left set on a race that has already run
- future races with no registration information
- registration windows closing soon

**To extend** when the catalogue moves into the database:

- events and categories whose `verified_at` is more than **12 months** old
- events with no categories at all — nobody can record a finish in those
- categories still marked `verified=no`, counted by event
- editions with no `start_date` beyond the expected few historical ones
  (a spike means the member-facing `claim` endpoint is being abused)

### Annual — the season refresh

**When**: UTMB publishes the next season around October–November; World
Trail Majors similarly. Independent races announce through the winter.

**Procedure**:

1. Re-read the UTMB and WTM calendars. Diff the event list against
   `data/race-events.csv`: additions, removals, and **series changes**.
2. For every event with a schedule row in the coming year, re-read its own
   site and diff the categories.
3. Add or update the new season's rows in `data/race-editions.csv` with
   fresh `source_url` and `verified_at`, then `pnpm tsx
   scripts/validate-race-editions.ts` and `pnpm seed:editions`
   (`scripts/import-race-editions.ts`). It upserts by `(event_key, year)`,
   so last season's row for the same event stays untouched as long as the
   year differs — required, because a member's race record points at the
   edition they ran.
4. Bump `verified_at` on every row actually re-read. **Only those** — a
   blanket bump makes the staleness report worthless, which is the same
   reason `VERIFIED_AT` in the seed is not raised for rows nobody checked.
5. `pnpm tsx scripts/validate-catalogue.ts` and review every warning.

`scripts/seed-race-schedule.ts` and `race_schedule` still exist —
`getFinishedRaces` (`src/lib/content.ts`) still reads that table for past
races. Retiring it is a separate, deliberate change (docs/plan's PR 5), not
something this procedure needs to touch.

### Per-row provenance

Every row in both CSVs carries:

| column | meaning |
|---|---|
| `source` | the exact URL the values were read from |
| `verified` | `yes` = a human read that URL; `no` = defaulted or assumed |
| `verified_at` | the day they read it. Empty means never. |
| `website` | the event's own site. Empty is allowed **only** when `source` says why |
| `itra_url` | `itra.run/Races/RaceDetails/<id>`, for next year's cross-check |

**Three events genuinely have no website**, and the distinction between that
and "nobody looked" is what `source` carries:

- **Barkley Marathons** — there is no official site. Entry is an email to a
  race director whose address is secret, the date is secret, and the course
  is secret. Matt Mahoney's FAQ is the de facto reference and has been for
  twenty years.
- **Huangshan 168** — runs under rotating sponsor names (徽州168, 西宏168)
  with registration through third-party platforms. No stable domain.
- **Mauritius Ultra-Trail** — its UTMB site now redirects away; see above.

`validate-catalogue.ts` fails on an empty `website` with an empty `source`,
so a genuine gap cannot pass as a documented absence.

`verified=no` is not a defect to be hidden. It was the honest state of 216
categories across 58 events when this file was written, and being able to
say so is what let them be worked through in passes rather than all at
once. Four remain.

`pnpm tsx scripts/validate-catalogue.ts --require-verified` refuses to import
while any `no` remains, for the day that becomes the right bar.

---

## Current state, 2026-08-05

| | count |
|---|---|
| events | 100 |
| categories | 394 |
| categories read from an event's own site | 390 |
| categories still unverified | 4, all `utmb-mauritius` |

**One unresolved event.** `mauritius.utmb.world` 302s to `utmb.world`, and
Mauritius is absent from UTMB's official events page. Both point the same
way — the event has left the series — but a site that disappeared is
absence of evidence, not evidence of absence, so its `series` is unchanged
until somebody finds who runs it now. Its four categories stay
`verified=no` and its `source` says exactly this.

## What the audit found

Checking all 95 events against their own sites turned up eight errors that
no amount of internal consistency would have caught:

| | was | is |
|---|---|---|
| `utmb-kagaspa` | China | **Japan** (Yamanaka Onsen, Ishikawa) — UTMB's own list says Indonesia, also wrong |
| `utmb-mrww` | Mountain Race Weekend, Switzerland | **Monterosa Walserwaeg, Italy** |
| `utmb-oh-my-deus` | Oh My Deus, France | **Oh Meu Deus, Portugal** |
| `utmb-snowdonia` | Ultra-Trail Snowdonia | **Eryri** — renamed, 301 redirect |
| `utmb-valholl` | Valhöll Fin del Mundo | **Ushuaia by UTMB**, same event |
| `other-translantau` | independent | **UTMB World Series** |
| `utmb-mauritius` | UTMB World Series | site gone, absent from the official list |
| — | missing | **`utmb-mut`**, Mountain Ultra Trail, South Africa |

And the two category assumptions failed everywhere they were tested. Not one
UTMB event runs 20K/50K/100K/100M; not one World Trail Majors event runs
Ultra/Short.
