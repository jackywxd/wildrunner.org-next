/**
 * A member writes a race report, and it reaches the public site.
 *
 * This is the feature the race domain model was built for: a post linked to a
 * completed race, carrying the badge for it. The link is not decoration —
 * attaching a race *creates the completion record*, which is what "有賽記就一定
 * 有徽章" means. A report whose record failed to appear would still render as a
 * post, so the assertion that matters is the one about the record.
 *
 * Written from a walkthrough rather than from the source: the flow was
 * recorded with Playwright codegen while a person used it, then checked
 * against `payload_versions` and the row counts. docs/member-publish-flow.md
 * has the account, including the two entry points — this covers the one that
 * starts from a blank post, because it exercises attaching a race that was not
 * preselected.
 *
 * The required fields come from the collection, not from guessing at the
 * screen: `title`, `slug`, `description`, `content`, paired with their
 * controls by `pnpm assert:schema-screen`. `slug` is filled by
 * `derivePostSlug` when left blank, and this journey leaves it blank on
 * purpose — that is the only place the derivation is exercised through the UI
 * a member actually uses.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { getWithRetry } from "../helpers/request";
import { deleteCreatedRows, leavePostEditor } from "../helpers/teardown";

test.describe("R what a member does with a race report", () => {
  /**
   * Teardown by the ids this test captured, and by nothing else.
   *
   * Two ids, because deleting the post does not remove the race record it
   * created — the record is the member's completion, and it outlives any post
   * that mentions it. Both are captured the moment they exist, before the
   * assertions that might fail.
   *
   * Never a title or a prefix. A cleanup written in the moment matched
   * `like: "PROBE"` against `"P2 PII Probe"` and destroyed twenty rows it had
   * not created. If an id was not captured, the row is not this test's to
   * delete.
   */
  let postId: string | null = null;
  let raceRecordId: string | null = null;

  test.afterEach(async ({ page, request }) => {
    const post = postId;
    const record = raceRecordId;
    postId = null;
    raceRecordId = null;
    await leavePostEditor(page);
    const pending: { collection: string; id: number | string }[] = [];
    if (post) pending.push({ collection: "posts", id: post });
    if (record) pending.push({ collection: "race-records", id: record });
    await deleteCreatedRows(request, pending);
  });

  test("R-REPORT: writes a report, attaches a race, and it publishes", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));

    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    // Anchored to the end. `/\/members(\/|$)/` also matches `/members/login`,
    // so a failed sign-in satisfied it and the next page loaded as an
    // anonymous visitor — which showed up much later as a missing control.
    // Third time a prefix pattern has passed for a page that never moved.
    await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });

    // By clicking, not by URL: soft navigation is where the calendar-toggle
    // bug lived, invisible to a suite that only ever used `goto`.
    await page.getByTestId("member-nav-posts").click();
    await page.getByTestId("posts-new").click();
    await expect(page).toHaveURL(/\/members\/posts\/\d+/, { timeout: budget(20_000) });

    const created = page.url().match(/\/members\/posts\/(\d+)/);
    if (!created) throw new Error(`no post id in ${page.url()}`);
    postId = created[1];

    await page.getByTestId("post-title").fill("R-REPORT race report");
    await page.getByTestId("post-description").fill("R-REPORT summary");
    await page.getByTestId("editor-content").fill("R-REPORT body");

    // Deliberately left blank. `derivePostSlug` fills it, and this is the only
    // place that runs through the form a member uses.
    await page.getByTestId("post-slug").fill("");

    // The first race and its first category, chosen without looking.
    //
    // `db:reset:local` and CI build the same known corpus: three completion
    // records seeded across three members, none of them a *report*, and none
    // on this race. So there is nothing to scan for. An earlier version read
    // the member's existing records and hunted for a free combination — that
    // logic was not caution, it was compensation for an environment nobody
    // prepared, and it made the run depend on the history of the last one.
    await page.getByTestId("post-race-attach").click();

    // Through the 最近結束的比賽 shortcut, which is what somebody writing about
    // last month's race reaches for. It is also the one control that can be
    // wrong in a way nothing else notices: it writes four fields at once
    // (`applyShortcut`), and an `eventId` written without its series leaves
    // the 賽事 select holding a value its own options do not contain.
    const recent = page.getByTestId("post-race-recent");
    await expect(recent).toBeVisible({ timeout: budget(15_000) });
    const raceValue = await recent
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    if (!raceValue) throw new Error("no finished race in the seeded corpus");
    await recent.selectOption(raceValue);

    // The event the shortcut chose has to be the one now selected, not merely
    // stored: that is the assertion that catches a missing series.
    await expect(page.getByTestId("race-event-select")).not.toHaveValue("");

    // Filled explicitly rather than relying on the shortcut: it auto-picks a
    // distance only for a race that offers exactly one, and the corpus's first
    // finished race offers several.
    const distanceSelect = page.getByTestId("race-distance-select");
    const distanceValue = await distanceSelect
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    if (!distanceValue) throw new Error("the seeded race offers no category");
    await distanceSelect.selectOption(distanceValue);

    await page.getByTestId("post-race-confirm").click();

    await expect(page.getByTestId("post-race-linked")).toBeVisible({
      timeout: budget(15_000),
    });
    // The attach flow reports its own refusals here, not in `post-message` —
    // a distinction that cost an afternoon when the wrong element was read.
    await expect(page.getByTestId("post-race-error")).toHaveCount(0);

    // Save the draft first, as the recorded walkthrough did. The editor tracks
    // unsaved changes, and the recording is the only verified account of this
    // flow anybody has.
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿", {
      timeout: budget(20_000),
    });

    await page.getByTestId("post-publish").click();

    // Publishing *leaves the editor* — `PostEditor` calls
    // `router.push("/members/posts")` on success — so the success message is
    // unobservable by construction: the element it lives in is gone with the
    // page. An earlier version asserted on it and could never have passed,
    // whatever the app did.
    //
    // The list URL, matched to the end. `/members/posts` is a prefix of
    // `/members/posts/<id>`, so a loose pattern would call a publish that
    // never left the editor a success.
    await expect(page).toHaveURL(/\/members\/posts$/, { timeout: budget(20_000) });

    // `page.request`, not the `request` fixture: the fixture has its own
    // context and no session, so it would read as an anonymous visitor and
    // report a draft as missing rather than as unpublished.
    const doc = await getWithRetry(page.request, `/api/posts/${postId}?depth=0`);
    expect(doc.ok(), "the post should be readable after publishing").toBe(true);
    const body = (await doc.json()) as {
      _status?: string;
      slug?: string;
      raceRecord?: number | string | null;
    };

    // The three claims this journey exists to make.
    expect(body._status, "published").toBe("published");
    expect(body.slug, "a slug was derived from the blank field").toBeTruthy();
    expect(body.raceRecord, "a completion record was created and linked").toBeTruthy();

    raceRecordId = String(body.raceRecord);
  });

  /**
   * R-OLDRACE — a report about a race from a year the calendar has never
   * heard of.
   *
   * THE FAILURE THIS PINS, and it shipped. The editor's picker was built from
   * finished `race-editions` rows, which reads like "races that have been run"
   * and is really "races somebody entered into the reviewed calendar". That
   * table holds 2026 and 2027 and nothing else — 39 and 38 rows, identical in
   * production, staging and local — so on 2026-09-02 the control offered 14
   * races, every one of them from this year. A member who ran TDS in 2019 and
   * sat down to write about it had no way to say so, while /members/races
   * would have logged the same claim without complaint. Reported as "連結賽事
   * 現在只能選擇2026年的".
   *
   * Nothing on screen said "2026 only", which is why no assertion caught it:
   * a dropdown with fourteen real races in it looks like a working dropdown.
   * So this test names a year outright rather than picking from what is
   * offered — reading the first option back would pass again the moment the
   * list narrowed to one year.
   *
   * `utmb-mont-blanc` / `tds` / 2019 is free by construction, not by luck. The
   * seed writes three records (`scripts/seed-e2e-account.ts`) — hardrock/100m
   * 2023, utmb-mont-blanc/ccc 2025, utmb-mont-blanc/occ 2024 — so this claim
   * collides with none of them, and `uniqueRaceRecord` therefore cannot turn
   * a create into a silent reuse of a row this test would then delete.
   *
   * The edition for (utmb-mont-blanc, 2019) does not exist and is expected not
   * to: `populateRaceRecordRefs` find-or-creates it from the event and the
   * year alone. The record's own `year` is what this asserts, because that is
   * the member's claim; the edition is a derived convenience.
   */
  test("R-OLDRACE: links a race from a year with no edition row", async ({
    page,
  }) => {
    test.setTimeout(budget(60_000));

    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });

    await page.getByTestId("member-nav-posts").click();
    await page.getByTestId("posts-new").click();
    await expect(page).toHaveURL(/\/members\/posts\/\d+/, { timeout: budget(20_000) });

    const created = page.url().match(/\/members\/posts\/(\d+)/);
    if (!created) throw new Error(`no post id in ${page.url()}`);
    postId = created[1];

    await page.getByTestId("post-title").fill("R-OLDRACE 2019 race report");
    await page.getByTestId("post-description").fill("R-OLDRACE summary");
    await page.getByTestId("editor-content").fill("R-OLDRACE body");

    await page.getByTestId("post-race-attach").click();

    // The shortcut is skipped entirely — it can only ever offer what the
    // calendar holds, and the point of this journey is the claim it cannot
    // express.
    await expect(page.getByTestId("race-event-select")).toBeVisible({
      timeout: budget(15_000),
    });
    await page.getByTestId("race-event-select").selectOption("utmb-mont-blanc");
    await page.getByTestId("race-distance-select").selectOption("tds");
    await page.getByTestId("race-year-select").selectOption("2019");

    await page.getByTestId("post-race-confirm").click();
    await expect(page.getByTestId("post-race-linked")).toBeVisible({
      timeout: budget(15_000),
    });
    // The attach flow reports its refusals here, not in `post-message`.
    await expect(page.getByTestId("post-race-error")).toHaveCount(0);

    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿", {
      timeout: budget(20_000),
    });

    const doc = await getWithRetry(
      page.request,
      `/api/posts/${postId}?depth=0&draft=true`,
    );
    const body = (await doc.json()) as { raceRecord?: number | string | null };
    expect(body.raceRecord, "a completion record was created and linked").toBeTruthy();
    raceRecordId = String(body.raceRecord);

    const record = await getWithRetry(
      page.request,
      `/api/race-records/${raceRecordId}?depth=0`,
    );
    const claim = (await record.json()) as {
      distanceId?: string;
      eventId?: string;
      year?: number;
    };
    // All three, because a wrong year with the right event would have been
    // exactly the old behaviour succeeding by accident.
    expect(claim.eventId).toBe("utmb-mont-blanc");
    expect(claim.distanceId).toBe("tds");
    expect(claim.year).toBe(2019);
  });

  test("R-DUPLICATE: a second report on the same race is refused", async ({
    page,
  }) => {
    // Measured, not guessed: this test took 19.6s of its 20s default on the
    // last green CI run, and 20.0s on the next one, where it died. Two full
    // sign-in-and-publish flows through dynamic member routes do not fit a
    // budget sized for a single page assertion, and the sibling below is at
    // 15.1s on the same ceiling. Raising it is what the rest of the suite
    // does for its heavy journeys (RF-T1..T4, SM-T1, Q1 — all lighter than
    // this one); leaving them here was an oversight, not a decision.
    test.setTimeout(budget(60_000));

    // The refusal is the feature. One report per member per race, and the site
    // says so on the start page rather than failing at save. An earlier draft
    // routed *around* this by hunting for an unused race, which discarded the
    // case and hid why the happy path was blocked.
    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    // Anchored to the end. `/\/members(\/|$)/` also matches `/members/login`,
    // so a failed sign-in satisfied it and the next page loaded as an
    // anonymous visitor — which showed up much later as a missing control.
    // Third time a prefix pattern has passed for a page that never moved.
    await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });

    // Arrive from the race itself. `:visible` was needed because `/races`
    // used to render this control twice — once at zero size, a
    // PageTransitionEffect.tsx Suspense defect, not a responsive breakpoint
    // (docs/testing-plan.md, "Open, not closed", 2026-08-17) — so `.first()`
    // could select a copy that could never be clicked. Fixed at the source;
    // kept here anyway as a cheap guard against the same shape recurring.
    // The window is chosen from the data, not from the calendar.
    //
    // `/races` anchors to the first of the current month (`scheduleWindow`),
    // and `race-write-report` only renders on a row that has already been
    // run. So on the 1st the default window can contain no finished race at
    // all, and this spec fails on a page and a feature that never changed.
    // That is what happened: green on 2026-08-31, red on 2026-09-01 in three
    // consecutive runs — deploy run 99 against staging and #105's shard 3
    // against localhost — while the only commit between them was an e2e
    // logging change. The September window held 63 races and the earliest
    // started on the 10th, so it would have stayed red for nine days, once a
    // month, forever.
    //
    // `?from=` is an absolute month precisely so it can be addressed like
    // this. Anchoring to the month of the most recent race that has actually
    // been run guarantees the window contains a finished row, and leaves the
    // claim under test untouched: arrive from the race itself, and the
    // refusal comes from submitting the second report.
    const editions = await getWithRetry(
      page.request,
      "/api/race-editions?limit=1&depth=0&sort=-startDate" +
        `&where[startDate][less_than]=${new Date().toISOString()}`,
    );
    expect(editions.ok(), "could not read race editions").toBeTruthy();
    const ran = ((await editions.json()) as { docs: { startDate: string }[] })
      .docs[0]?.startDate;
    if (!ran) throw new Error("the corpus contains no race that has been run");

    await page.goto(`/races?from=${ran.slice(0, 7)}`, {
      waitUntil: "domcontentloaded",
    });
    const write = page
      .locator('[data-testid="race-write-report"]:visible')
      .first();
    await expect(write).toBeVisible({ timeout: budget(15_000) });
    const href = await write.getAttribute("href");
    if (!href) throw new Error("the report control has no destination");
    await write.click();
    await expect(page).toHaveURL(/\/members\/posts\/new/, { timeout: budget(20_000) });

    const distance = page.getByTestId("race-report-distance");
    const category = await distance
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    if (!category) throw new Error("the finished race offers no category");
    await distance.selectOption(category);
    await page.getByTestId("race-report-start").click();
    await expect(page).toHaveURL(/\/members\/posts\/\d+/, { timeout: budget(20_000) });

    const created = page.url().match(/\/members\/posts\/(\d+)/);
    if (!created) throw new Error(`no post id in ${page.url()}`);
    postId = created[1];
    const doc = await getWithRetry(page.request, `/api/posts/${postId}?depth=0`);
    const body = (await doc.json()) as { raceRecord?: number | string | null };
    if (body.raceRecord) raceRecordId = String(body.raceRecord);

    // The same race again — and the refusal comes from *submitting*, not from
    // loading. `StartRaceReport` sets it inside the handler, so a test that
    // only navigates back sees nothing and would read as a missing feature.
    //
    // `race-report-error` is the element the component actually uses. An
    // invented `race-report-start-error` cost an afternoon, because a wrong
    // selector fails as "element not found" — indistinguishable from a
    // regression.
    await page.goto(href, { waitUntil: "domcontentloaded" });
    // Wait for hydration, not just for HTML. `domcontentloaded` fires once the
    // parser is done, which on a hard reload can be before React attaches
    // `<select>`'s listeners — Playwright's `selectOption` then sets the native
    // DOM value and dispatches a `change` event nobody is listening for yet.
    // The browser keeps showing the option selected; React's `distanceId`
    // state never moves, so the button — gated on that state, not the DOM —
    // stays disabled forever. The distance select is disabled until `chosen`
    // resolves, so waiting for it to become enabled is waiting for the exact
    // condition this component needs, not an arbitrary pause.
    const distanceSelect = page.getByTestId("race-report-distance");
    await expect(distanceSelect).toBeEnabled({ timeout: budget(15_000) });
    await distanceSelect.selectOption(category);
    await page.getByTestId("race-report-start").click();
    await expect(page.getByTestId("race-report-error")).toContainText(
      "已經寫過",
      { timeout: budget(15_000) },
    );
  });
});
