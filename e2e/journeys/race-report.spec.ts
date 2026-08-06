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

  test.afterEach(async ({ request }) => {
    const post = postId;
    const record = raceRecordId;
    postId = null;
    raceRecordId = null;
    if (!post && !record) return;

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    if (!login.ok()) throw new Error(`teardown could not sign in: ${login.status()}`);

    for (const [collection, id] of [
      ["posts", post],
      ["race-records", record],
    ] as const) {
      if (!id) continue;
      const deleted = await request.delete(`/api/${collection}/${id}`);
      // 404 means the test's own steps got there first. Anything else leaves a
      // row behind, and saying so here is cheaper than the next run failing
      // for a reason it cannot explain.
      if (!deleted.ok() && deleted.status() !== 404) {
        throw new Error(
          `teardown failed to delete ${collection}/${id}: ${deleted.status()}`,
        );
      }
    }
  });

  test("R-REPORT: writes a report, attaches a race, and it publishes", async ({
    page,
  }) => {
    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    // Anchored to the end. `/\/members(\/|$)/` also matches `/members/login`,
    // so a failed sign-in satisfied it and the next page loaded as an
    // anonymous visitor — which showed up much later as a missing control.
    // Third time a prefix pattern has passed for a page that never moved.
    await expect(page).toHaveURL(/\/members$/, { timeout: 15_000 });

    // By clicking, not by URL: soft navigation is where the calendar-toggle
    // bug lived, invisible to a suite that only ever used `goto`.
    await page.getByTestId("member-nav-posts").click();
    await page.getByTestId("posts-new").click();
    await expect(page).toHaveURL(/\/members\/posts\/\d+/, { timeout: 20_000 });

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
    const raceSelect = page.getByTestId("race-report-race");
    await expect(raceSelect).toBeVisible({ timeout: 15_000 });
    const raceValue = await raceSelect
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    if (!raceValue) throw new Error("no finished race in the seeded corpus");
    await raceSelect.selectOption(raceValue);

    const distanceSelect = page.getByTestId("race-report-distance");
    const distanceValue = await distanceSelect
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    if (!distanceValue) throw new Error("the seeded race offers no category");
    await distanceSelect.selectOption(distanceValue);

    await page.getByTestId("post-race-confirm").click();

    await expect(page.getByTestId("post-race-linked")).toBeVisible({
      timeout: 15_000,
    });
    // The attach flow reports its own refusals here, not in `post-message` —
    // a distinction that cost an afternoon when the wrong element was read.
    await expect(page.getByTestId("post-race-error")).toHaveCount(0);

    // Save the draft first, as the recorded walkthrough did. The editor tracks
    // unsaved changes, and the recording is the only verified account of this
    // flow anybody has.
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿", {
      timeout: 20_000,
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
    await expect(page).toHaveURL(/\/members\/posts$/, { timeout: 20_000 });

    // `page.request`, not the `request` fixture: the fixture has its own
    // context and no session, so it would read as an anonymous visitor and
    // report a draft as missing rather than as unpublished.
    const doc = await page.request.get(`/api/posts/${postId}?depth=0`);
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


  test("R-DUPLICATE: a second report on the same race is refused", async ({
    page,
  }) => {
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
    await expect(page).toHaveURL(/\/members$/, { timeout: 15_000 });

    // Arrive from the race itself. `:visible` because the page renders this
    // control twice — once at zero size for the other breakpoint — so
    // `.first()` selects one that can never be clicked.
    await page.goto("/races", { waitUntil: "domcontentloaded" });
    const write = page
      .locator('[data-testid="race-write-report"]:visible')
      .first();
    await expect(write).toBeVisible({ timeout: 15_000 });
    const href = await write.getAttribute("href");
    if (!href) throw new Error("the report control has no destination");
    await write.click();
    await expect(page).toHaveURL(/\/members\/posts\/new/, { timeout: 20_000 });

    const distance = page.getByTestId("race-report-distance");
    const category = await distance
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    if (!category) throw new Error("the finished race offers no category");
    await distance.selectOption(category);
    await page.getByTestId("race-report-start").click();
    await expect(page).toHaveURL(/\/members\/posts\/\d+/, { timeout: 20_000 });

    const created = page.url().match(/\/members\/posts\/(\d+)/);
    if (!created) throw new Error(`no post id in ${page.url()}`);
    postId = created[1];
    const doc = await page.request.get(`/api/posts/${postId}?depth=0`);
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
    await page.getByTestId("race-report-distance").selectOption(category);
    await page.getByTestId("race-report-start").click();
    await expect(page.getByTestId("race-report-error")).toContainText(
      "已經寫過",
      { timeout: 15_000 },
    );
  });
});
