# What the old suite knew

The 45 specs deleted in the rewrite carried their reasoning in doc comments —
not descriptions of what the code does, but accounts of what went wrong once
and why an assertion was added. That is the part worth keeping; the assertions
themselves are being rebuilt from `docs/testing-plan.md`'s use cases.

Harvested before deletion so no incident has to be rediscovered. Where a new
test covers the same ground, it should say so and cite the incident here.

The short list, in the words the specs used:

- **The calendar toggle.** `/races?view=calendar` shipped broken: clicking 月曆
  changed the URL and nothing else. `PageTransitionEffect` keyed its
  `AnimatePresence` on `usePathname()` alone, so `/races` and
  `/races?view=calendar` produced the same key and framer-motion never swapped
  the children. Invisible to the suite by construction — every spec navigated
  with `goto`, a full document load, where the transition component never runs.
  **Anything reachable by a link needs one test that arrives by clicking.**
- **PII behind every card.** `posts.owner`, `galleries.owner`, `media.owner`
  and `authors.owner` are relationships to `users`. At depth ≥ 1 Payload
  populates the whole account — email, invite state, the live session array —
  and Next's dev server writes raw `find()` results into the RSC flight stream,
  which lands them in the page HTML.
- **Soft 404s.** Missing posts and galleries answered 200 with the not-found
  page in the body, so crawlers indexed them. `I18nProvider` gated children
  behind a `useState`/`useEffect` flag; effects do not run during SSR, so the
  server rendered an empty body and `notFound()` never threw before Next
  committed the status. **Assert the status, not the body.**
- **A health check that touched nothing.** Smoke covered `/` and an
  unauthenticated `/admin`. Both render without the database, so a deploy once
  500'd every dynamic route while smoke stayed green.
- **`__name is not defined`.** next-themes serialises its anti-FOUC script by
  `toString()`; the Worker bundler re-bundles it with esbuild's `keepNames`,
  which rewrites the body to call a helper that only exists inside the bundle.
  Every page threw and the theme class was never applied.
- **Cached drafts.** A page cached as "not found" stayed cached after
  publishing, because `revalidatePath` had nowhere to record the invalidation
  until a tag cache was configured.

---

## The harvested notes, verbatim

### admin/branding.spec.ts

Through Payload's own theme cookie, not by setting the attribute.
This used to `page.evaluate(() => documentElement.setAttribute(...))`
after `goto`, which mutates <html> while React is still hydrating. When
the mutation won the race, React reported "a tree hydrated but some
attributes of the server rendered HTML didn't match" — a console error
the test itself had caused. It failed all three retries on one CI run and
passed entirely on the previous one, on identical application code.
`payload-theme` is the cookie Payload's ThemeProvider reads (see
@payloadcms/ui providers/Theme: `${cookiePrefix || "payload"}-theme`), so
setting it before navigating makes the server render the theme. No
mutation, no race — and asserting `data-theme` afterwards makes this a
stronger test than forcing the value ever was.

### members/ai.spec.ts

M6 — AI access for members.
/api/ai/expand-post already only checked `req.user`, so members could
already call it (P4 covers the endpoint itself). What changed here is the
rate-limit key: it used to be `${user.id}:${ip}`, so switching network or
spoofing a header reset a member's budget. These tests are about that
boundary specifically, not re-covering P4.

### members/large-upload.spec.ts

V0 — large media uploads.
Files over 50 MB reach R2 intact but the document create fails with
`File type text/plain (from extension m4v) is not allowed.` The extension
in that message is incidental: a 60 MB .mp4 fails identically, while the
same file at 6 MB succeeds. The cause is a size threshold, not a format.
@payloadcms/storage-r2 refuses to hand a >50 MB object back to the server
(`new Response(null, { status: 200 })`) so the Worker doesn't run out of
memory, but Payload core reads that response into `req.file.data`
regardless. `checkFileRestrictions` then sniffs zero bytes, finds nothing,
and falls back to a ten-entry extension map in which every video type
resolves to `text/plain`.
The fix takes large files out of that pipeline entirely rather than
repairing a step inside it — see PLAN-large-uploads.md.
These tests drive the same two calls the admin UI makes, so they cover the
server contract without depending on the upload component that V3 adds.

### navigation/click-paths.spec.ts

N — every navigable control, reached by clicking it.
WHY THIS FILE EXISTS. `/races?view=calendar` shipped broken: clicking 月曆
changed the URL and nothing else, and a manual refresh was needed before
the calendar appeared. The cause was `PageTransitionEffect` keying its
`AnimatePresence` on `usePathname()` alone, so `/races` and
`/races?view=calendar` produced the same key and framer-motion never
swapped the children.
The suite could not have caught it. `race-schedule.spec.ts` reaches the
calendar with `page.goto("/races?view=calendar")` — a full document load,
where the transition component never runs. Every other spec navigates the
same way. So the application's entire soft-navigation behaviour — client
routing, transitions, RSC payload handling, route-level cache — was
exercised by nothing at all.
The rule this file enforces: **tests navigate by URL, users navigate by
clicking, and those are different code paths.** Anything reachable by a
link needs at least one test that arrives the way a person does.
Deliberately shallow. It asserts arrival, not content — the content specs
cover that, and duplicating them here would make this file expensive to
keep true. What it uniquely proves is that clicking works at all.

### public/posts.spec.ts

Fields that exist only on a `users` document. `posts.owner` and
`authors.owner` are both relationships to `users`, so a public query at
depth >= 2 populates the whole account record — and Next's dev-mode
server-IO instrumentation writes raw `find()` results into the RSC flight
stream, which lands them in the page HTML. Grepping the markup for these
is the assertion that the public queries never fetch them in the first
place.
The password is never in the document at any depth (Payload strips it), so
it is deliberately not on this list — asserting on it would pass whether or
not the leak exists.

### public/posts.spec.ts

Deployed origins only, and that gate is the point of the test.
`ImageResponse` rasterises through two different pipelines depending on
where it runs. The documented one is Satori + Resvg, and that is what the
Worker uses: workerd has no native modules, so `@vercel/og`'s
`import("sharp")` fails and it falls back to the Resvg WASM build. Under
`next dev` that import succeeds, so it takes a `sharp` fast path instead —
and Payload processes uploaded images with the *same* `sharp` in the *same*
Node process. Once the media specs have run, that shared instance can no
longer rasterise Satori's SVG and `/og` answers 500.
Reproduced deliberately: `/og` returns 200 before `e2e/media/` runs and 500
immediately afterwards on the same server, while
`curl https://wildrunner.org/og?title=test` returned a valid 1920x1080 PNG
throughout. Locally this test asserted on a code path that is never
deployed and failed for a reason no reader can hit.
Same reasoning as `e2e/public/cache-headers.spec.ts`: a test that cannot
tell the shipped state from a local artefact is not testing the product.
deploy.yml's `verify-staging` runs the suite against staging, so this still
gates a release — just not a pull request.

### smoke.spec.ts

P0-T6 — a signed-in page that has to reach the database.
WHY THE TWO ABOVE ARE NOT ENOUGH. Both hit pages that render without
touching D1: `/` is prerendered, and `/admin` unauthenticated is the
static login form. A staging deploy once 500'd every dynamic route in
the app while both of these kept returning 200, so the smoke check said
the site was up while nothing a logged-in member could do worked.
`/members/posts` is the cheapest page that cannot lie: it requires a
session, queries `posts` scoped to the member, and renders their own
list. If Payload cannot initialise — a bad binding, a half-applied
migration, a config that throws in the Worker — this fails and the two
tests above still pass.
Verify by breaking it, once, deliberately: this assertion is only worth
having if it has been seen to fail.

### unit/access.spec.ts

U-ACCESS — the access rules, called directly.
These are the most security-relevant functions in the codebase and until now
they were only ever asserted by creating rows over HTTP as one account and
reading them back as another. That proves Payload applies what the rule
returns; it does not pin down what the rule returns, and it costs a server,
a database and a fixture per case.
Each rule is a pure function of `user`, so the four callers that matter —
anonymous, member, a different member, admin — are four object literals.
The contract layer keeps exactly one test proving Payload honours a returned
`Where`; everything about *which* `Where* is here.
Written from the source, not from memory: `ownedOnly` returns a
published-only filter for an anonymous caller rather than `false`, and
`ownedOnlyPublicRead` returns `true` for one — a distinction that reads as a
typo until you see them side by side, and which decides whether the REST API
leaks drafts.
