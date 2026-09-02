# Testing strategy

Written after a session where the suite was 257 tests, ran in 7 minutes, was
green — and every page of the admin panel was failing hydration while 582 rows
of content sat unowned and unassignable. Both directions were broken at once:
tests that said "fine" when it wasn't, and tests that said "broken" when it
was not.

Every rule below names the failure that bought it. If a rule ever looks like
ceremony, the failure it cites is the argument for keeping it.

---

## 0. The one rule the rest follow from

**A test tests a user's use case. It does not test the framework.**

Measured on the suite this was written for: 257 tests, of which roughly

| | | |
|---|---|---|
| ~76 | 30% | our own logic — calendar maths, race state, badge tokens, quota, ownership |
| ~27 | 10% | our configuration of the framework — i18n, access, cache headers, bindings |
| **~154** | **60%** | **the framework's own behaviour** — that Lexical edits, that Payload saves a draft, that Next renders and routes and authenticates |

Six tests in ten were proving that Payload is Payload and Next is Next. We did
not write any of that code, the vendors test it, and asserting it has a
specific price: it can only be done through a running server and a browser, so
it is slow, it breaks when vendor internals move (Payload 3.87's nav drawer and
Next 16's cache defaults each cost a day here), and it needs `retries` to stay
green.

And it did not work. While 60% of the effort went there, a nested `<html>`
broke hydration on every admin page and 582 rows of content sat unowned — both
of them our code, neither of them covered.

So, in order:

1. **Is this a user's use case?** If yes it earns a journey test — one, that
   walks the whole path.
2. **Is this our own logic?** If yes it earns a unit test, and probably several.
3. **Is this our configuration of a framework?** If yes it earns one thin
   assertion, because a misconfiguration is user-visible even when the
   framework is faultless.
4. **Otherwise it is the vendor's.** Do not test it.

## 0.1 The use cases

The list §8 says is missing. A journey test exists for one of these or it does
not exist.

**A visitor**
- reads an article, including its images, tables, code blocks and embedded video
- browses a gallery, and opens one photo
- looks at the race calendar, moves the window, filters by series
- opens a rider's page and sees their badges
- shares a link and gets a preview card
- hits a URL that does not exist and gets a 404

**A member**
- signs in, and is refused when they should be
- writes a post, saves a draft, publishes it, unpublishes it
- uploads photos and a large video, and sees them in their library
- is stopped at their storage quota, with an explanation
- records a race and sees the badge appear
- asks the AI to draft from an outline, and keeps their text when it fails
- edits their profile

**An admin**
- invites a member, who can then sign in
- reaches the member area and comes back
- maintains the race schedule
- sees every member's content, which a member cannot

Anything asserted that is not on this list, and is not our logic or our config,
is a candidate for deletion.

---

## 1. Why a test exists

**A test exists because one specific failure would be costly *and* invisible.**

Both halves. Costly and visible needs no test — you would see it the first time
you loaded the page. Invisible and cheap is not worth the maintenance.

Write the failure down before writing the assertion. If you cannot name it in a
sentence, you are testing that the code is the code.

> The console-error guard exists because a nested `<html>` broke hydration on
> every admin page and 250 green tests could not see it. That is the sentence.

## 2. Which level

**The cheapest level that can observe that failure.** Not the most realistic —
the cheapest sufficient one.

| level | runs against | use when the failure lives in |
|---|---|---|
| **unit** | imported functions, nothing else | logic: dates, parsing, hashing, state machines |
| **contract** | HTTP against a local server | access control, validation, response shape, ownership |
| **journey** | a browser against a local server | rendering, hydration, client routing, forms, uploads |
| **deployed** | HTTP/browser against a deployed origin | the artefact: cache headers, bundling, the Worker runtime |

Today: 34 unit, 78 contract, 145 journey. That shape is roughly right. What was
missing is the *rule* — so tests drifted upward, and a question about a CSS
value got answered by booting a browser.

> `A1-T4` asked "does the wordmark inherit page colour". A CSS question. It
> loaded the admin login, mutated `<html data-theme>` mid-hydration, and
> reported the hydration error it had just caused.

**Going up a level must be justified in the test, not assumed.** Going down
never needs justification.

## 3. What makes a test trustworthy

A test is code, and nothing tests it. These four are what stand in for that.

### 3.1 It must have been seen to fail

Break the thing deliberately, watch it go red, restore. An assertion never
observed failing is an untested claim about untested code.

> The first version of the domain-model migration guard misread the driver's
> result shape, logged four `undefined`s, and skipped its own check while
> reporting success. The console guard was landed only after reintroducing the
> layout bug and watching it report five errors.

### 3.2 It must fail *for the reason it names*

A red that does not match the test's own description is a broken test even
while it is red. Read the failure before believing it.

> `P2-T8` is named "/og returns an image". It failed — because `next dev`
> rasterises through `sharp`, a path the Worker never takes. Production served
> a valid PNG throughout. The name and the failure had nothing to do with
> each other.

### 3.3 It must not cause what it observes

If the test writes the state it then asserts on, it is watching itself.

> `A1-T4`, above. Also: any spec that mutates the DOM before hydration
> settles, or seeds a row and then asserts a corpus-wide count.

### 3.4 A red is adjudicated against something that is not a test

When a test and the code disagree, one of them is wrong, and the suite cannot
tell you which. Four sources can, and each costs under two minutes:

| question | source |
|---|---|
| does this happen to users? | `curl` the deployed origin |
| what is actually stored? | `wrangler d1 execute --command "select ..."` |
| what is this API supposed to do? | the vendor's own docs, `node_modules/<pkg>/dist/docs` first |
| what did the server say? | the dev server's log |

> Every conclusion that held this session came from one of those four. Every
> conclusion that was wrong came from reasoning about tests. An hour went into
> `/og` before anyone ran `curl https://wildrunner.org/og`, which settled it in
> two seconds.

**Do this before the second hypothesis, not the fifth.**

## 4. Rules per level

### unit
- No clock, no network, no database. `now` is a parameter — that is why
  `calendar.ts` takes one. This one is mechanical: the lane has no server to
  reach (§9), and `assert:tests` fails a spec here that names `page.`,
  `request.` or `BASE_URL`. A test that needs one has changed level — move the
  file, do not weaken the rule.
- Construct dates as `new Date("2026-08-01T12:00:00Z")`, never
  `new Date(2026, 7, 1)`: the second is local time and flips half the
  assertions on a UTC-7 runner.

### contract
- Create your own fixtures and delete them.
- Never assert on an ambient count unless the test is *declared* a corpus test
  (§5).

### journey
- **Arrive the way a user does** when the path is the point. `goto` and a click
  are different code paths; the calendar-toggle bug lived entirely in the
  second and was invisible to a suite that only used the first.
- Do not write to the DOM you are asserting on.
- Every browser spec imports `test` from `e2e/helpers/test.ts`, which fails on
  any `pageerror` or `console.error`. Its ignore list is a list of things the
  app cannot cause and cannot stop; adding to it removes a class of error from
  view, so each entry carries its justification inline.

### deployed
- **`e2e/deployed/` is the whole level, and it is a smoke suite.** For two
  years this section described a level with *zero members* — the specs it named
  (`cache-headers.spec.ts`, `P2-T8`) do not exist — while `deploy.yml` filled
  the gap by pointing the entire journey suite at deployed staging. Measured
  over 25 runs that gate passed first time about 40% of the time against the PR
  gate's 79%, and of six failures read line by line none was a product defect.
  `docs/release-pipeline.md` carries the numbers and the decision.
- **Ask only what a deployment can answer.** The PR gate runs `next dev` on
  emulated local D1 and an empty local R2, so it cannot see the OpenNext
  production bundle, remote D1 with migrations applied, the R2 binding, or
  Payload's CSRF against the deployed `serverURL`. That list is the level's
  scope. Anything else about how the app behaves belongs before merge.
- **A cold start is not a defect.** A Worker answers `There was an error
  initializing Payload` for up to a couple of minutes after a deploy; the
  workflow waits for a 200 before running anything, and a check that reports
  waking up as a failure is miscalibrated rather than strict.
- **Writes are the exception, not the shape.** One upload that deletes itself
  is the only way to prove the R2 write path from outside. Adding a second
  write here means re-opening the argument the release-pipeline doc settled.

> `M6-T3` skips against a real deployment because 11 sequential Workers AI
> calls outlast the 60-second rate-limit window. The rate limit is therefore
> asserted nowhere that ships. Either the window is testable in production or
> the limit needs a seam that does not depend on real inference latency.

## 5. Corpus tests are declared, not accidental

A spec that asserts about *data that is already there* — rather than data it
created — catches a whole class nothing else does, and breaks differently. It
must say so, and it must cover the whole class.

> `M1-T8` asserts no row is unowned. It was right, had been failing, and was
> written off as "a pre-existing failure" without being read. It also checked
> `posts` alone: the same defect covered `media` (546), `galleries` (20),
> `authors` (1) and 50 version rows. **582 rows, and the test looked at 15.**

- Say in the test that it reads ambient data.
- Cover every member of the class, not one example.
- Local D1 is e2e residue, not realistic data — a corpus assertion that leans
  on it passes locally and fails in CI, where the database starts empty.

## 6. "Pre-existing", "flaky" and "known failure" are not classifications

Every failing test is exactly one of:

- **app bug** — the test is right, fix the code
- **test bug** — the assertion is wrong, fix or delete it
- **environment** — the data or host is wrong, fix that, and say why the test
  still earns its place

`flaky` is a claim about a mechanism. Produce the mechanism or it is not a
classification.

> `G-T2` was "flaky" for weeks. The mechanism: Payload's sidebar is a drawer
> below 1440px, Playwright's default viewport is 1280, and the page `<h1>`
> intercepts the click. Measured — 1280 blocked, 1440 blocked, 1600 reachable.
> Not flaky. Deterministic, at a viewport nobody had chosen deliberately.

## 7. Retries hide mechanisms

`retries: 2` in CI is a concession to the environment being inside the system
under test, not a tool for making red things green. A test that only passes on
retry has an unexplained mechanism, and the retry is what stops anyone
explaining it.

### 7.1 A budget judged against the wrong clock is the same failure

A timeout is a claim about how long the system may take, and the answer
depends on which system. Locally a Payload write is sub-second; against a
deployed Worker talking to remote D1 the same write costs seconds. Measured
on the 2026-08-26 staging deploy, one journey:

    login 3.6s · create draft 4.5s · race record 7.5s
    save draft 10.2s · publish 19.5s · delete 9.7s

`R-REPORT` failed there on `toHaveURL(..., { timeout: 20_000 })` while the
publish it was waiting for returned **200 in 19,487ms**. Nothing was broken.
The test still had four and a half minutes of its own budget left, because
`playwright.config.ts` already raises the per-test budget from 20s to 300s
against a deployed origin — and 49 per-step budgets inside the specs did not
follow.

That red says "the app did not navigate" and means "a dev server's clock was
used to judge a Worker". It is the retry problem wearing a different hat: the
mechanism is hidden, and the obvious response — bump this one number — hides
it again for everyone else.

So per-step budgets go through `budget()` (`e2e/helpers/budget.ts`), which
takes the number that is right for a dev server and scales it by target.
`scripts/assert-test-strategy.mjs` refuses a bare number, because this rule
was already implicit in the config and 49 call sites quietly ignored it.

## 8. Test IDs are handles, not references

`P2-T8`, `M1-T8`, `A1-T4` look like they point at numbered requirements. **162
of 211 point at nothing** — the scheme began as traceability to
`PLAN-members.md` and every test since has copied the form.

They stay, because they are useful handles for `-g` and for talking about a
test. They are not evidence that a requirement exists. Do not go looking for
a spec document behind one.

## 9. Speed is a correctness feature

CI is four jobs: `checks` (typecheck, asserts and the unit lane, ~50s), `e2e`
across three shards, `build`. Sharding rather than raising `workers`, because
every spec in the `e2e` job shares one local D1 and the corpus tests would race
fixture creation.

Each shard must pass alone before the split lands — sharding regroups spec
files and surfaces any latent dependency between them.

**A level runs in a lane carrying only what that level needs, and lanes come
before shards.** `--shard` divides by test *count*, which is only a proxy for
cost while the tests are comparable. They were not. Measured:

|  | corpus | journeys | unit | tests | clock |
|---|---|---|---|---|---|
| shard 1 | 12 | 30 | 32 | 74 | **6m19s** |
| shard 2 | | | 67 | 67 | 46s |
| shard 3 | | | 65 | 65 | 38s |

One shard held every browser test there was. The other two held pure functions
and nothing else — and still paid a container, an install, `payload migrate`
and ~2m30s of seeding each to run about a third of a second of assertions,
because `webServer` and `globalSetup` are `TestConfig` options with no
per-project form. Perfectly balanced by count; 10:1 by clock.

So the unit level has its own config (`playwright.unit.config.ts`) with no
server and no database, and runs in `checks` in ~6s. `e2e` shards only what
needs a server, a database or a browser. **A second config file is the
mechanism, not a preference** — a project cannot opt out of the server the
config starts.

The browser lane is still not balanced, and the number is worth carrying
rather than rounding away. On CI (run 33290945244, the first fully green one):
`checks` 50s, the three shards 2m42s / 4m56s / 4m23s, `build` 2m49s, whole
workflow **5m02s against the ~9m45s it replaced**. The uploads and the AI
journeys land together in shard 2, so sharding by count buys less than a third
of the time. `--shard` divides by count and nothing else, so the lever left is
sharding by duration from the previous run's report — worth reaching for when
the spread costs more than the complexity, not before.

Two costs inside that 5m02s are worth knowing before trying to shrink it
further. The seeded fixture database is cached, so on a hit the migrate and
seed steps skip entirely: restore 1s and a re-stamp of the e2e account 8s,
where seeding used to be 2m16s-2m51s *per shard*. And `globalSetup` now warms
20 routes rather than 8, at 53.8s — compile time moved out of test budgets
rather than removed, after a sharded run put an unwarmed route's first compile
inside `P-PHOTO`'s 20s budget and failed it.

`assert:tests` enforces the boundary: a spec under `e2e/unit/` that reaches for
`page.`, `request.` or `BASE_URL` fails the build. Without that the lane decays
back into the mixed suite one commit at a time.

Slow feedback is not just annoying: an 18-minute red is one nobody reads
carefully, and this whole document is about failures nobody read carefully.

## Every dev run rebuilds the environment and its data

**Setup and teardown are mandatory, not optional, and they run every time.**

This project does it correctly in CI and not at all locally. Each CI job starts
from an empty database and runs `payload migrate`, `migrate:velite`,
`seed:races`, `seed:e2e:account`, `seed:editions` — a known corpus, rebuilt per
run. A developer's machine inherits everything every previous run and
walkthrough left behind; AGENTS.md calls local D1 what it is, e2e residue.

The cost of that gap is measured, not theoretical. Two journeys collided with
rows created minutes earlier — one with its own residue after a mid-way
failure, one with a record from a manual walkthrough — and in both cases the
first instinct was to add logic that *scans for unused data*. That logic is the
symptom: a test hunting for a free slot is compensating for an environment
nobody prepared, and it makes each run depend on the history of the last.

**Conflicting state is a test path, not an obstacle.** "You already wrote a
report for this race" is behaviour worth its own assertion. Routing around it
discards a case and hides why the happy path was blocked.

## Setup and teardown

A test prepares the data it needs and removes what it created, **including
when it fails**. Teardown on the happy path only is not teardown.

`e2e/journeys/member-races.spec.ts` is the worked example. It creates a race
record through the form and deletes it through the form, because removing one
is part of what a member does — and it *also* deletes by id in `afterEach`,
because the two times it failed at the public-badge assertion it never reached
the delete step, and the record it left behind made the next run fail as a
duplicate. That second failure described something that was not wrong.

Rules:

- Teardown goes in `afterEach`, so it runs on pass, fail and throw.
- Delete **by id, what this test created. Never with `like`, a prefix, or any
  pattern — treat this as absolute.** A fuzzy match in a query returns the
  wrong rows; in a delete it destroys them. A cleanup written to remove one
  probe row used `like: "PROBE"` and took twenty rows titled `"P2 PII Probe"`
  with it, none of them its own. Never clear a collection either: local D1
  holds real rows.
- If an id was not captured at creation, the row is not the test's to delete.
  **Report it and let a person run the delete** — see docs/member-publish-flow.md.
- Capture the id as soon as the object exists, before the assertions that
  might fail.
- Teardown may use the API even where the test drives the UI. It is not the
  subject of the test.
- **Verify teardown by forcing a failure and checking the database.** It was
  verified that way here: the mapping was broken deliberately, the journey
  failed after creating its record, and the member owned zero records
  afterwards.

Preparation has the same standard. A spec that leans on whatever the
environment happens to hold passes locally and fails in CI — see the seed step
in `.github/workflows/e2e.yml`, added after three journeys silently skipped
against an empty database. Either seed what the test needs, or assert on a
delta that ambient data cannot move.
