# The test suite, rewritten

The replacement for the current 257 tests. `docs/testing-strategy.md` is the
reasoning; this is the inventory built from it.

The rule it applies, from §0 of the strategy: **a test tests a user's use case,
our own logic, or our configuration of a framework. Nothing else.** Measured on
the suite this replaces, ~60% was none of those — it asserted that Lexical
edits, that Payload saves a draft, that Next renders and routes. We did not
write that code and the vendors test it.

| | now | after |
|---|---|---|
| unit | 34 | **62** |
| contract | 78 | **34** |
| journey | 145 | **21** |
| deployed | 0 (3 gated) | **7** |
| **total** | **257** | **124** |

Wall clock, projected: unit ~2s, contract ~90s, journey ~4min, deployed only
after a deploy. The current suite is 7 minutes for all of it.

---

## 1. The use cases

The specification whose absence produced 162 test IDs pointing at nothing. A
journey test exists for an entry here, or it does not exist.

### A visitor (not signed in)

| | use case |
|---|---|
| V1 | reads an article — text, inline images, tables, code blocks, an embedded video |
| V2 | browses the gallery index, opens one gallery, opens one photo |
| V3 | watches a gallery video, and shares a link straight to it |
| V4 | opens the race calendar, moves the window forward and back, filters by series |
| V5 | switches the schedule between list and calendar views |
| V6 | opens a rider's page and sees their badges |
| V7 | shares any page and the link preview renders |
| V8 | asks for something that does not exist and gets a real 404 |
| V9 | sees none of anyone's account data, on any public page |
| V10 | reads the about page |

Derived from the routes that actually exist, not from imagination — the first
draft of this list omitted `/about` (live, 200 on staging) and had no position
on `src/app/(site)/design-preview/*`. Those five routes answer 404 on both
staging and production, so they are a development surface and get no tests;
if they ever start resolving, that is a finding, not a feature.

### A member

| | use case |
|---|---|
| M1 | signs in; is refused with a wrong password; is refused where they lack rights |
| M2 | writes a post, saves it as a draft, sees it is not public, publishes it, sees it is |
| M3 | unpublishes a post and it leaves the public site |
| M4 | uploads photos, and a video large enough to need the direct-to-R2 path |
| M5 | resumes an interrupted large upload rather than starting over |
| M6 | is stopped at their storage quota, and told why |
| M7 | sees only their own posts, media and byline — never another member's |
| M8 | records a race and the badge appears on their rider page |
| M9 | drafts from an outline with AI, and keeps their text when it fails |
| M10 | edits their display name and it appears on their posts |

### An admin

| | use case |
|---|---|
| A1 | invites someone, who receives a usable link and can then sign in |
| A2 | moves between the admin panel and the member area, both directions |
| A3 | sees and edits every member's content |
| A4 | maintains the race schedule and reads the staleness report |
| A5 | uses the admin panel in Traditional Chinese |

### The operator (deploy-time)

| | use case |
|---|---|
| O1 | a deploy reaches the environment it names, never the other one |
| O2 | private pages are never stored by a shared cache |
| O3 | the deployed artefact serves what the dev server served |

---

## 2. Unit — 62 tests

No clock, no network, no database. Milliseconds. This is where logic belongs
and where most of the growth goes.

| module | tests | protects |
|---|---|---|
| `races/calendar.ts` | 16 | month boundaries, leap days, UTC anchoring, 42-cell grids, clamped spans — *exists, keep as-is* |
| `races/race-state.ts` | 12 | upcoming/ongoing/finished transitions, registration windows — *exists, keep* |
| `races/design-tokens.ts` | 6 | badge colour is stable for a key across environments — *exists, keep* |
| `races/badge-source.ts` | 4 | an unknown event id degrades to a placeholder, never throws |
| `lib/youtube.ts` | 5 | every URL shape a member might paste resolves to one id; a non-video URL resolves to none |
| `lib/quota.ts` | 4 | default quota, per-user override, the boundary at exactly the limit |
| `lib/cf-image.ts` | 4 | own-origin absolute URLs become relative; remote ones are left alone |
| `access/index.ts` | 6 | `isOwner`, `ownedOnly`, `isAdmin` return the right constraint for admin / owner / stranger / anonymous |
| `lib/lexical-helpers.ts` | 3 | a paragraph round-trips; an empty body is empty |
| `lib/content.ts` selects | 2 | no `select` names `owner` — the PII rule, checked as data not as rendered HTML |

**Why `access/index.ts` moves down.** Ownership is our most security-relevant
logic and it is currently asserted by creating rows over HTTP and reading them
back. The rule itself is a pure function of `user` — assert it directly, and
keep exactly one contract test proving Payload applies what it returns.

## 3. Contract — 34 tests

HTTP against a local server. No browser. Fixtures created and deleted by the
test.

| group | tests | protects |
|---|---|---|
| access matrix | 12 | for each of `posts`/`media`/`galleries`/`race-records`: anonymous, member, other member, admin — create/read/update/delete |
| validation | 6 | duplicate slug, illegal media type, impossible date range, missing required field, oversize upload, malformed anchor |
| PII | 4 | no public response carries `email`, `sessions`, `invitePending`, `storageQuotaMb` at any depth reachable from a public query |
| ownership corpus | 4 | *corpus-scoped* — no row in `posts`/`media`/`galleries`/`authors` is unowned |
| endpoints | 5 | invite, storage usage, direct-upload-init, schedule maintenance, AI expand — auth required, input validated |
| rate limit | 3 | the AI limit counts per member, ignores IP and User-Agent, and refuses past the ceiling |

**The rate limit gets a seam.** It is currently asserted only against
localhost, because 11 real inference calls outlast a 60-second window — so it
is asserted nowhere that ships. The limiter takes `now` as a parameter, like
`calendar.ts` does, and two of these three become unit tests.

## 4. Journey — 21 tests

A browser, and only for what a browser can show: rendering, hydration, client
routing, forms, uploads. One per use case, walking the whole path.

Every one imports `test` from `e2e/helpers/test.ts`, so any `pageerror` or
`console.error` fails it.

| id | use case | walks |
|---|---|---|
| J1 | V1 | open an article from the index by clicking; assert text, an image, a table, a code block and the video player all render |
| J2 | V2 | gallery index → one gallery → one photo, all by clicking |
| J3 | V3 | gallery → video → the share URL opens the same video directly |
| J4 | V4 | calendar: move forward, move back, filter by series, all without a reload |
| J5 | V5 | toggle list ↔ calendar by clicking — the regression that started `click-paths` |
| J6 | V6 | riders index → a rider → badges present with the right event and year |
| J7 | V8 | a missing post and a missing gallery each answer 404, not a soft 404 |
| J8 | M1 | sign in, wrong password refused, member cannot reach an admin-only page |
| J9 | M2 | write → save draft → confirm hidden publicly → publish → confirm visible |
| J10 | M3 | unpublish → confirm gone from the public site |
| J11 | M4 | upload an image and a >32 MB video; both appear in the library |
| J12 | M5 | interrupt a large upload, resume, and confirm it did not restart |
| J13 | M6 | exceed the quota and read the message |
| J14 | M7 | a member's library and post list show only their own |
| J15 | M8 | record a race; the badge appears on the rider page |
| J16 | M9 | AI drafts from an outline; an error leaves the existing text intact |
| J17 | M10 | change display name; it appears on their post |
| J18 | A1 | invite → the link works → the invitee signs in |
| J19 | A2 | admin → member area → back |
| J20 | A4 | edit the schedule in admin; the public page reflects it |
| J21 | A5 | the admin panel renders in Traditional Chinese |

That is 21 journeys against 145 today. The 124 that go were asserting vendor
behaviour one feature at a time — every Lexical block type, every draft state
transition, every form field. J1 and J9 still fail if the editor breaks,
because they walk the whole path; they simply do not enumerate Lexical.

## 5. Deployed — 7 tests

Only what the artefact shows. Gated on a non-localhost base URL, run by
`deploy.yml`'s `verify-staging`.

| id | protects |
|---|---|
| D1 | `/og` returns a real image — the Worker's Resvg path, which `next dev` never takes |
| D2 | private paths are never cached by a shared cache (O2) |
| D3 | public paths revalidate rather than being reused blind |
| D4 | a signed-in page that queries the database returns 200 — the check that would have caught a deploy 500ing every dynamic route |
| D5 | the deploy landed in the environment it named (O1) |
| D6 | published content appears within the revalidation window |
| D7 | uploads reach R2 and are served back |

## 6. What goes, and why it is safe

| going | count | why |
|---|---|---|
| per-block editor assertions | 31 | Lexical's own behaviour. J1 and J9 fail if the editor breaks. |
| upload plumbing variants | 19 | R2 multipart is `@payloadcms/storage-r2`'s. J11/J12 cover the paths that are ours: the filename reservation and the resume. |
| draft/publish state matrix | 14 | Payload's versions feature. J9/J10 walk it. |
| rendering assertions per page | 21 | Next's rendering. The journeys open every page type. |
| auth/session mechanics | 11 | Payload's auth. J8 covers sign-in and refusal; the access matrix covers who may do what. |
| admin chrome details | 9 | Payload's admin. J21 covers the one thing we configured — language. |
| duplicated PII checks | 5 | four pages asserting the same rule. One contract test on the query, one journey on rendered HTML. |

Nothing on this list is a use case, our logic, or our configuration.

## 7. Order

Each step lands green before the next starts.

1. **Unit layer first** — add the 28 new unit tests. Nothing is deleted yet, so
   the suite only gets stronger and any disagreement between a new unit test
   and an existing e2e test is information.
2. **Contract layer** — rewrite the access matrix and PII checks; give the rate
   limiter its `now` seam.
3. **Journeys** — write the 21. Verify each one fails when its use case is
   broken, per strategy §3.1.
4. **Delete** — only now, and only what §6 lists, one group per commit so a
   regression can be bisected to the group that caused it.
5. **Deployed** — promote D1–D7 into `verify-staging`.

`scripts/assert-test-strategy.mjs` runs in CI's `checks` job throughout, so the
rules bind while the rewrite is in progress rather than after it.

## Open, not closed

Things that went red once and are not explained. Listed so they are not
quietly forgotten, and so a recurrence is recognised as a second occurrence
rather than a first.

### M-RACES read 2 badges where it added 1 record (CI, run 31076762757)

`expect(badgeCount).toBe(before + 1)` received 2. It has not reproduced —
the same commit plus a logging-only change passed, and the probe showed a
single badge under a single rider card, identical to local.

Ruled out, with evidence rather than argument:

- **Residue from an earlier run.** Each CI job builds its own database.
- **The new editions table.** Nothing in the rider rendering path reads it;
  `/riders` renders one card per rider.
- **A second rider.** CI seeds exactly one author, and the probe reported one
  card.

What changed in response: the assertion matched on event and year only, so it
counted every category a member entered at that race in that year as the same
badge. It now matches event, category and year. **That is a narrowing, not a
diagnosis** — it makes a recurrence say something specific instead of
something ambiguous.

Per docs/testing-strategy.md §6, "flaky" is not a classification. This is an
open item with no mechanism, and it stays here until it has one or until it
has gone a long time without returning.

### A member pressing Back does not see a record they just added

Noticed while writing `member-races.spec.ts`: `goBack()` after visiting
`/riders` restored Next's client router cache, showing the list as it was
before the add. The journey navigates explicitly instead, because that
question is a different test's subject. Whether it is a bug worth fixing has
not been decided.
