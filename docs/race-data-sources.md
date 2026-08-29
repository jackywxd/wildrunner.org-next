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
| **Qualifier lists** — Western States / Hardrock | `race_categories` | **Yearly.** Both lotteries re-cut their list each season. | Somebody enters a race believing it counts toward a lottery it no longer does |

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

### Qualifier lists

Two lotteries publish a list of races a finish counts from, and **both list
entries, not events**:

- **Western States** — `https://www.wser.org/qualifying-races/`. Long (~250
  entries), and identifies each one by race name *and distance*.
- **Hardrock** — `https://hardrock100.com/qualifying-races.php`. Far shorter
  (~36 entries), and **not a subset of the WS list**. Published as a
  two-year grid: which year's finish qualifies you for which running.

**This is why the flags live on `race_categories` and not on `race_events`.**
At Mont-Blanc the UTMB and the CCC are on the Western States list and the OCC
is not. An event-level flag would tell somebody a 60K entry qualifies them for
a 100-mile lottery. Every cheaper shortcut gets this wrong — "the longest
category qualifies", "a UTMB World Series race qualifies" — and gets it wrong
invisibly, because the page still renders.

**Read the notes column; it disqualifies as well as qualifies.** The WS list
carries per-row remarks, and two kinds must not be confused:

- *"not a qualifying race for 2027"*, *"NOT eligible for lottery entry"* —
  the entry does **not** qualify. `Zugspitz 106km` is ours: it is on the page
  but explicitly excluded, so `utmb-zugspitz/zut100` is `no`.
- *"cancelled due to weather"*, *"canceled due to wildfires"* — that year's
  running did not happen. **The race is still on the list.** Fat Dog,
  Tenerife, Valhöll and Sierras del Bandolero all read this way.

**What a static flag cannot express.** Each lottery has its own qualifying
*window*, and Hardrock's grid drops races between years — `other-bigfoot-200`
and `other-tor-des-geants` qualify only via their 2025 running. The flag
means **"on the most recently read list"**, nothing finer. Per-edition
modelling would mean moving these columns to `race_editions`; `/races` says
so in its own footer rather than implying a precision the data lacks.

**Pairs that could not be settled**, left with no checked-on date so they read
as unresolved rather than as "checked, does not qualify":

| List entry | Our catalogue | Why it is unresolved |
|---|---|---|
| WS "Monte Rosa WalserWaeg by UTMB - LSV 122km" | `utmb-mrww/sdv`, 120 km | Abbreviation disagrees (LSV vs SDV) |
| WS "Mount Yun by UTMB - UMY 159.6km" | `utmb-mut/miler`, 168 km | MUT and UMY are probably different events |
| WS "DL 100 106km" (China) | `other-dali-100/100k` | Plausible, unconfirmed |

**Settled since, by the site owner, not by derivation.** Hardrock
"Ultra-Trail Cape Town" is `wtm-cape-town/utct` — the 160.9 km / 7516 m
entry. Note what did *not* decide it: "the longest category qualifies" is
listed above as a shortcut that gets this wrong. What the distances give is
a check on the answer rather than the answer — every other entry on the
Hardrock list is 160 km or longer (UTMB 174, GPT100 Miler 162, Fat Dog 200,
and the four that publish no distance are all 100-milers or beyond), and
UTCT is the only Cape Town category in that range. `ut100` is 100 km and
stays `no`. Dated 2026-08-27, the day it was confirmed — a day later than
the rest of the Cape Town rows, which is the point of the per-row date.

Also noted, needing no decision here: the WS list carries `TOR100` and
`TOR130`, which our `other-tor-des-geants` does not have as categories, and
`Endurance Trail des Templiers 105km`, which is a different race from the
76 km `other-templiers/76k` we carry. Both are catalogue gaps, not qualifier
questions.

### The marathon majors

Six road marathons — Tokyo, Boston, London, Berlin, Chicago, New York — sit
in the catalogue under a series of their own, `marathon`, so a member can
record them and earn the 六大馬拉松 badge. Three things about them are
deliberate and easy to undo by accident.

**None of their editions may be given a start date.** `/races` lists
editions, not events, and `getUpcomingRaces` requires
`startDate: { exists: true }` — so an undated edition is invisible there
while the member picker, which reads the catalogue, offers the race
normally.

The obvious version of this rule — "they have no editions" — is wrong, and
believing it would hide the real hazard. `populateRaceRecordRefs`
find-or-creates a `(event, year)` edition for every record a member writes,
so editions for these six appear on their own the first time anybody logs
one. The hook writes only event and year, never a date, precisely so a
member's claim cannot dictate the public calendar. What would put the Berlin
Marathon on 野馬營's schedule is therefore not a new edition row — it is an
admin filling in `startDate` on one of the rows that are already there.

**`marathon` is excluded from the schedule's filter chips**, through
`SCHEDULE_SERIES` in `src/lib/races/catalogue.ts`. A chip for a series with
no editions can only ever land on 「這個條件下沒有賽事」.

**`verified` is `no` on all twelve rows.** Nobody has read these events' own
sites — the session that added them had no outbound network — so the flag
says so rather than the omission implying it. The distances are not in
doubt; who checked them is. Both qualifier dates are empty for the same
reason: a road marathon cannot be on either lottery's list (WSER's shortest
entry is 100 km, Hardrock's is 160), but those columns record a reading, not
an inference.

The badge itself turns on an explicit key list in
`src/lib/races/six-majors.ts`, not on the series — six `marathon` records is
not a Six Star if two of them are Boston. `U-SIXMAJORS` asserts that list
against the seeded catalogue, because the same six keys are written out in
`data/race-events.csv`, in the generated `seed-data.ts`, and in
`20260829_041500_add_marathon_majors`, and a typo in any of them awards the
badge to nobody with no error anywhere.

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
- `eventsWithNoEdition` — events in `race-events` with zero rows in
  `race-editions` at all
- `dateless` — every edition with no `startDate`, not just a count. Expected
  in small numbers (a member claiming a historical race with no known date —
  RaceEditions.ts's own reason `startDate` is optional). A spike, or one that
  keeps growing week over week with no corresponding shrink in
  `eventsWithNoEdition`, means the weekly refresh below has stopped running,
  or the member-facing claim path is being abused — not that races stopped
  announcing dates.

**Still to extend**, this time for `race-events`/`race-categories` rather
than editions:

- events and categories whose `verified_at` is more than **12 months** old
- events with no categories at all — nobody can record a finish in those
- categories still marked `verified=no`, counted by event

### Weekly — the reviewed-CSV refresh

`scripts/refresh-race-editions.ts` reads the same shape the daily job
computes — `eventsWithNoEdition`, plus rows that are stale, finished with no
next edition, or have a registration window closing within 30 days — and
prints a worklist. It never fetches an organiser's page itself and never
writes to the CSV; deciding what a page actually says is judgment, the same
reason `export-catalogue.ts`'s pair never became a scraper (see "Why this is
not scraped" above).

A scheduled cloud agent (`race-editions-weekly-refresh`, Sundays) reads that
worklist, re-visits each row's own site, and opens a PR with whatever
changed — reviewed and merged by a human, same as every other change to
these CSVs. It never merges its own PR and never runs
`seed:editions:staging`/`:prod`; pushing researched data to a live database
stays a deliberate, separate step.

### Annual — the qualifier lists

Both lists are re-cut each season, so this is a yearly pass, not a one-off.
It never goes through a migration: a migration runs once per environment, and
staging and production already have their categories.

1. Read both pages and update `qualifies_wser` / `qualifies_hardrock` and the
   matching `*_verified_at` in `data/race-categories.csv`.
   **Only bump a date for a row actually re-read.**
2. `pnpm validate:catalogue` — refuses a flag set with no date, and prints the
   qualifier counts so a silent zero cannot pass for "checked, none qualify".
3. `pnpm seed:qualifiers:dry` — shows the diff without writing.
4. `pnpm seed:qualifiers` (local), then `:staging`, then `:prod`.

`scripts/import-race-qualifiers.ts` only ever **updates**, never creates a
category — a category is a foreign key a member's badge points at. It owns
four cells per row and touches nothing else, and it skips any row the
database has checked more recently than the CSV, so an admin's own edit in
`/admin` survives the next run. The staleness check runs **per list**, which
is why the two dates are separate columns: refreshing WS must not stamp a
Hardrock flag nobody looked at.

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

`race-categories.csv` carries four more, one pair per lottery. They are
deliberately **not** folded into `verified`/`verified_at` above: those record
whether a human read the *event's own site* to confirm the line-up, which is
a different document on a different clock. `verified=no` with a qualifier
flag set is a real state — the line-up was assumed, but the list names the
event — and conflating the two would make it unrepresentable.

| column | meaning |
|---|---|
| `qualifies_wser` / `qualifies_hardrock` | `yes` = on that lottery's most recently read list |
| `wser_verified_at` / `hardrock_verified_at` | the day somebody read that list. **Empty means never** — which is what separates "read it, this does not qualify" from "nobody has looked". |

One date per list, not one for both: they are re-read at different times, and
a shared date would stamp "checked" onto a flag nobody looked at.

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
