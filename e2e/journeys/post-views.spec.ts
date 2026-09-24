import type { APIRequestContext } from "@playwright/test";

import { apiTest as test, expect } from "../helpers/api-test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { anonContext } from "../helpers/members";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * M-VIEWS — the read count an author sees counts other people's reads of
 * this article, and nothing else.
 *
 * CONTRACT LEVEL, NO BROWSER. Both decisions live on the server — one SQL
 * statement in `recordPostView`, one create hook — and are observable through
 * the endpoint and the number `/members/posts` renders. `ViewBeacon` itself is
 * a `fetch` in a `useEffect`, and U-VIEWS already covers the only logic it has.
 *
 * AN ANONYMOUS READ IS THE CONTROL IN BOTH TESTS. A count that stays at 0 is
 * also what a broken endpoint, a wrong post id or an unreadable page would
 * produce; an anonymous read moving it to exactly 1 is what proves the
 * instrument can report the other answer.
 */

/** A published post owned by whoever `request` is signed in as. */
async function createPublishedPost(
  request: APIRequestContext,
  label: string,
): Promise<number> {
  const stamp = Date.now();
  const post = await request.post("/api/posts", {
    data: {
      _status: "published",
      content: {
        root: {
          type: "root",
          format: "",
          indent: 0,
          version: 1,
          direction: "ltr",
          children: [
            {
              type: "paragraph",
              format: "",
              indent: 0,
              version: 1,
              direction: "ltr",
              children: [
                { type: "text", text: "閱讀量", format: 0, style: "", mode: "normal", detail: 0, version: 1 },
              ],
            },
          ],
        },
      },
      description: "閱讀量",
      slug: `${label.toLowerCase()}-${stamp}`,
      title: `${label} ${stamp}`,
    },
  });
  expect(post.ok(), await post.text()).toBeTruthy();
  return ((await post.json()) as { doc: { id: number } }).doc.id;
}

/** The count `/members/posts` shows the owner for `postId`. */
async function shownCount(
  owner: APIRequestContext,
  postId: number,
): Promise<number> {
  const list = await owner.get("/members/posts");
  expect(list.ok(), `members list: ${list.status()}`).toBeTruthy();
  const html = await list.text();
  const match = html.match(
    new RegExp(`data-testid="post-views-${postId}"[^>]*>(\\d+)`),
  );
  expect(match, `no view count rendered for post ${postId}`).not.toBeNull();
  return Number(match![1]);
}

/** One read by somebody signed out, as a visitor's beacon sends it. */
async function anonymousRead(baseURL: string | undefined, postId: number) {
  const anon = await anonContext(baseURL);
  try {
    const visitor = await anon.post(`/api/posts/${postId}/view`);
    expect(visitor.status()).toBe(204);
  } finally {
    await anon.dispose();
  }
}

test.describe("M-VIEWS what an author's read count includes", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    await deleteCreatedRows(request, created.splice(0, created.length));
  });

  test.beforeEach(async ({ request }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();
  });

  /**
   * THE FAILURE, in one sentence: the owner is the one reader certain to open
   * their article — after publishing, after every edit — so counting them
   * makes 「N 次閱讀」 overstate readers by however often the author checked,
   * and nothing on the page can show it.
   *
   * Seen red: with `readerId` passed as `null` in the endpoint, step 1 reads 1.
   */
  test("M-VIEWS-T1: the owner's own read is not counted, an anonymous one is", async ({
    baseURL,
    request,
  }) => {
    test.setTimeout(budget(60_000));

    const postId = await createPublishedPost(request, "M-VIEWS-T1");
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-VIEWS-T1 probe post" });

    expect(await shownCount(request, postId), "a new article starts at 0").toBe(0);

    // 1. The owner reads it — signed in, as the beacon's same-origin fetch is.
    const own = await request.post(`/api/posts/${postId}/view`);
    expect(own.status()).toBe(204);
    expect(
      await shownCount(request, postId),
      "the owner's own read was counted",
    ).toBe(0);

    // 2. The control.
    await anonymousRead(baseURL, postId);
    expect(
      await shownCount(request, postId),
      "an anonymous read was not counted",
    ).toBe(1);
  });

  /**
   * THE FAILURE, in one sentence: SQLite gives a deleted newest post's id to
   * the next post created, `post_views` has no foreign key, so the new article
   * is born showing the deleted one's reads — found when T1's second local run
   * created its post at a reused id and read 1 before anyone had opened it.
   *
   * Seen red: with `resetPostViewsOnCreate` removed from `Posts.hooks`, the
   * final assertion reads 1.
   */
  test("M-VIEWS-T2: a post created at a deleted post's id starts at 0", async ({
    baseURL,
    request,
  }) => {
    test.setTimeout(budget(60_000));

    const firstId = await createPublishedPost(request, "M-VIEWS-T2");
    created.push({ collection: "posts", id: firstId });
    recordCreated({ collection: "posts", id: firstId, note: "M-VIEWS-T2 first post" });

    // The control: the first post really has a read to leave behind.
    await anonymousRead(baseURL, firstId);
    expect(await shownCount(request, firstId)).toBe(1);

    // Deleted through the API, the way a member deletes one.
    const deleted = await request.delete(`/api/posts/${firstId}`);
    expect(deleted.ok(), await deleted.text()).toBeTruthy();
    created.splice(0, created.length);

    const secondId = await createPublishedPost(request, "M-VIEWS-T2");
    created.push({ collection: "posts", id: secondId });
    recordCreated({ collection: "posts", id: secondId, note: "M-VIEWS-T2 second post" });

    // Not a precondition to hope for — the case under test. The first post was
    // the newest, the suite runs one worker against its own database, so
    // SQLite hands the id straight back. If something else created a post in
    // between, this says so rather than passing without having tested reuse.
    expect(
      secondId,
      "the id was not reused, so this run did not exercise inheritance",
    ).toBe(firstId);

    expect(
      await shownCount(request, secondId),
      "the new post inherited the deleted post's reads",
    ).toBe(0);
  });
});
