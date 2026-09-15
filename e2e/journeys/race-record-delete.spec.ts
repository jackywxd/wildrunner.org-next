import { apiTest as test, expect } from "../helpers/api-test";
import { TEST_ADMIN } from "../helpers/auth";
import { UNLINK_FLAG } from "../../src/lib/members/race-record-unlink";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * M-RACEDEL — a member deletes a race record an article still cites.
 *
 * THE FAILURE THIS EXISTS FOR, in one sentence: the delete is refused by a
 * foreign key, and the member is told 「刪除失敗，請再試一次」 — advice that
 * can never work, about a constraint that will refuse it every single time.
 *
 * `posts.race_record_id` and `_posts_v.version_race_record_id` both declare
 * `REFERENCES race_records(id)` with no `ON DELETE` action, so D1 raises
 * `SQLITE_CONSTRAINT_FOREIGNKEY` and Payload returns a 500 reading
 * `Something went wrong.` `refuseRaceRecordInUse` turns that into a 409
 * naming how many articles cite it, and a second request carrying the
 * member's confirmation clears those references and lets the delete
 * through — what `ON DELETE SET NULL` would do, without a rebuild of the
 * site's content tables. This is what watches both halves stay so.
 *
 * WHY THE SUITE COULD NOT SEE IT. `member-races.spec.ts` deletes a record
 * too — one the spec created seconds earlier and never attached to anything,
 * so it takes the path that has always worked. The record that breaks is the
 * one with an article on it, which no test had. That is the blind spot
 * docs/testing-strategy.md names: specs assert on fixtures they created.
 *
 * CONTRACT LEVEL, NO BROWSER. What is at risk is what the API answers; the
 * member-facing half is `RaceRecordManager` showing whatever message comes
 * back, which is two lines and has no branch a browser could exercise that a
 * 409 body does not. `member-races.spec.ts` already drives the real 刪除
 * button for the case that succeeds.
 *
 * T1 WALKS THE WHOLE PATH DELIBERATELY, and the last assertion is the one
 * that matters most: the article is still there afterwards, intact, with
 * only its race link cleared. A delete that took the article with it, or
 * left it half-written, is the failure this design is one raw UPDATE away
 * from. The middle step pins the trap that made the original bug unreadable:
 * unlinking the race in the editor looks like it should free the record and
 * does not, because every draft already saved still cites it.
 */
test.describe("M-RACEDEL deleting a race record an article cites", () => {
  /** Old enough that no seeded record or edition can collide with it. */
  const EVENT_ID = "other-hardrock";
  const DISTANCE_ID = "100m";
  const YEAR = 2015;

  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    // Reversed: the post has to go before the record it points at, which is
    // the very constraint under test.
    const pending = created.splice(0, created.length).reverse();
    await deleteCreatedRows(request, pending);
  });

  test("M-RACEDEL-T1: refused with a count, then confirmed, and the article survives", async ({
    request,
  }) => {
    test.setTimeout(budget(60_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const record = await request.post("/api/race-records", {
      data: { distanceId: DISTANCE_ID, eventId: EVENT_ID, year: YEAR },
    });
    expect(record.ok(), await record.text()).toBeTruthy();
    const recordId = ((await record.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "race-records", id: recordId });
    recordCreated({
      collection: "race-records",
      id: recordId,
      note: "M-RACEDEL probe record",
    });

    const stamp = Date.now();
    const post = await request.post("/api/posts?draft=true", {
      data: {
        _status: "draft",
        description: "比賽紀錄刪除",
        raceRecord: recordId,
        slug: `m-racedel-${stamp}`,
        title: `M-RACEDEL ${stamp}`,
      },
    });
    expect(post.ok(), await post.text()).toBeTruthy();
    const postId = ((await post.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "posts", id: postId });
    recordCreated({
      collection: "posts",
      id: postId,
      note: "M-RACEDEL probe post",
    });

    // 1. Cited by an article: refused with a reason, not a 500.
    const cited = await request.delete(`/api/race-records/${recordId}`);
    expect(cited.status(), "a cited record must be refused, not 500").toBe(409);
    // One article, not one row. The article has a live row and a version row
    // per save, so counting rows would tell a member with a single draft
    // that several articles use it.
    expect(await cited.text()).toContain("1 篇文章");

    // The count is in `data` as well as the sentence, because the
    // confirmation the UI builds from it is a number, not a string to parse.
    const refusal = (await cited.json()) as {
      errors: { data?: { articles?: number } }[];
    };
    expect(refusal.errors[0]?.data?.articles).toBe(1);

    // 2. The obvious fix is not one, and this is the half that made the
    //    original failure so hard to read. Clearing the link writes a new
    //    draft version holding null and leaves every version already saved
    //    still pointing at the record, so the delete is refused exactly as
    //    before — the member did the one thing that looks like it should
    //    help and got the identical answer.
    const unlink = await request.patch(`/api/posts/${postId}?draft=true`, {
      data: { raceRecord: null },
    });
    expect(unlink.ok(), await unlink.text()).toBeTruthy();

    const unlinked = await request.delete(`/api/race-records/${recordId}`);
    expect(unlinked.status(), "unlinking does not free the record").toBe(409);

    // 3. Confirmed: the references go, and so does the record.
    const confirmed = await request.delete(
      `/api/race-records/${recordId}?${UNLINK_FLAG}=true`,
    );
    expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
    created.splice(
      created.findIndex((row) => row.collection === "race-records"),
      1,
    );

    // Read it back rather than trust the 200: a delete that reported success
    // and left the row is the shape this file is about.
    const gone = await request.get(`/api/race-records/${recordId}?depth=0`);
    expect(gone.status(), "the record is still there after a 200").toBe(404);

    // 4. THE ASSERTION THAT MATTERS MOST. The article keeps everything
    //    except the race link — a delete that reached into `posts` with raw
    //    SQL and damaged the row would pass every assertion above.
    const article = await request.get(`/api/posts/${postId}?draft=true&depth=0`);
    expect(article.ok(), await article.text()).toBeTruthy();
    const body = (await article.json()) as {
      description: string;
      raceRecord: unknown;
      slug: string;
      title: string;
    };
    expect(body.raceRecord, "the badge link should be cleared").toBeNull();
    expect(body.title).toBe(`M-RACEDEL ${stamp}`);
    expect(body.slug).toBe(`m-racedel-${stamp}`);
    expect(body.description).toBe("比賽紀錄刪除");
  });
});
