# Publishing a post, and attaching a race to it

Recorded from a real walkthrough on 2026-08-06 (Playwright codegen, plus the
version history and database delta that confirm what each step actually did).
Written down because the flow has two entry points, one non-obvious control,
and a failure mode that shows nothing on screen.

## The flow

```
/members/login
  member-login-email     → fill
  member-login-password  → fill
  member-login-submit    → click        → lands on /members

member-nav-posts   → click              → /members/posts
posts-new          → click              → a draft exists from this moment,
                                          titled 未命名文章 with a generated
                                          slug (untitled-<epoch>)

post-title         → fill
post-description   → fill
post-slug          → fill                (see "the silent failure" below)

post-race-attach   → click              ← the race picker is here, inside the
race-report-race     → selectOption       editor. It is NOT the only way in:
race-report-distance → selectOption       /races has `race-write-report`
post-race-confirm  → click                linking to /members/posts/new?race=<id>

editor-content     → fill               ← the body. `editor-content`, not a
                                          bare [contenteditable] lookup

post-save-draft    → click
post-publish       → click
```

Attaching a race **creates a `race-records` row and links it** as
`posts.raceRecord`. Measured across the walkthrough: posts 358 → 359 and
race records 6 → 7, with post 369 carrying `raceRecord=7`. That is the
"有賽記就一定有徽章" invariant working — a report cannot exist without the
record its badge is drawn from.

## The silent failure

**Publishing with an empty slug does nothing, and says nothing.** No version
is written, no message appears, the button is not disabled, and the status
stays 草稿.

The version history of the walkthrough post shows it exactly:

```
15:21:41  draft      slug=untitled-1786029701537   title=未命名文章
15:22:34  draft      slug=(empty)                  title=測試文章title
15:22:55  published  slug=candian-death-race-2026  title=測試文章title
```

There were **two** clicks on `post-publish`. The first — between 15:22:34 and
15:22:55, with the slug cleared — produced no version at all. The second, after
a slug was typed, published.

The person walking the flow hit this and worked around it without stopping,
which is what makes it worth writing down: the workaround is invisible in the
result, so the next person meets it fresh.

An earlier attempt failed the same way with a title left as 未命名文章. The
common shape is **a required field missing, reported nowhere**.

None of the 42 tests can see this. They assert on outcomes of flows that
succeed; nothing asserts that a refused publish explains itself.

## For whoever writes the journey

- Use `TEST_ADMIN` from `e2e/helpers/auth.ts`, never the literal password —
  codegen writes the literal into its output.
- The two entry points are different journeys. `/races` →
  `race-write-report` preselects the race and derives the title from it;
  `/members/posts` → `posts-new` starts blank and attaches the race later.
- Assert the race record's *creation*, not just the link: the count going up
  by one is the part that would break silently if attaching stopped creating.
- The journey's own `afterEach` deletes **by the ids it captured**, never by a
  title or prefix. Deleting the post does not remove the race record, so both
  ids have to be captured.
- **Anything beyond that is proposed, not performed.** If rows are found that
  a run left behind, list their ids and hand the list over — a person runs the
  delete. A cleanup written in the moment destroyed twenty unrelated rows here
  by matching `like: "PROBE"` against `"P2 PII Probe"`.
