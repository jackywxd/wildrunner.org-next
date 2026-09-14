import { expect, test } from "../helpers/test";
import { waitForHydration } from "../helpers/hydration";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows, leavePostEditor } from "../helpers/teardown";

/**
 * M-UNDO — taking back the last edit, from the toolbar.
 *
 * `HistoryPlugin` has been mounted since the editor shipped, so on a laptop
 * ⌘Z always worked and these buttons only make it visible. On a phone there
 * is no ⌘Z at all: until the buttons existed, a member who deleted a
 * paragraph by accident had no way back. That is the case this covers, and
 * it is why the test clicks rather than pressing keys — the keyboard path
 * is Lexical's and needs no test of ours; the wiring from a button to it is
 * ours and is what can break.
 *
 * **The disabled state is half the feature.** A button that is always live
 * promises an undo that does nothing on a fresh document, and a member
 * cannot tell that apart from one that silently failed — so the fresh-page
 * assertion below is not a nicety. The opposite failure is worse and
 * quieter: `CAN_UNDO_COMMAND` never arriving leaves both buttons disabled
 * forever, which looks like a deliberately inert toolbar rather than a bug.
 *
 * Nothing here asserts *how much* one undo takes back. Lexical coalesces
 * typing into history steps by its own rules, so "the text changed" and
 * "redo puts back exactly what was there" are the two properties that hold
 * whatever those rules are.
 */

const TYPED = "這段話等一下要被收回";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/members/login", { waitUntil: "domcontentloaded" });
  // The login form is a Client Component whose <form> has no `action`:
  // submitted before React attaches, nothing is sent at all.
  await waitForHydration(page);
  await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
  await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
  await page.getByTestId("member-login-submit").click();
  await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });
}

test.describe("M-UNDO a member takes back an edit from the toolbar", () => {
  const created: { collection: string; id: number }[] = [];
  let postId = 0;

  test.beforeEach(async ({ request }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const post = await request.post("/api/posts?draft=true", {
      data: {
        title: `復原測試 ${stamp}`,
        slug: `m-undo-${stamp}`,
        description: "復原測試",
        _status: "draft",
      },
    });
    expect(post.ok(), `post create failed: ${post.status()}`).toBeTruthy();
    postId = (await post.json()).doc.id as number;
    created.push({ collection: "posts", id: postId });
    recordCreated({ collection: "posts", id: postId, note: "M-UNDO probe post" });
  });

  test.afterEach(async ({ page, request }) => {
    const pending = created.splice(0, created.length).reverse();
    await leavePostEditor(page);
    await deleteCreatedRows(request, pending);
  });

  test("M-UNDO-T1: 復原 takes the typing back and 重做 returns it", async ({
    page,
  }) => {
    // The first visit to /members/posts/<id> in a run pays next dev's
    // on-demand compile.
    test.setTimeout(budget(60_000));

    await signIn(page);
    await page.goto(`/members/posts/${postId}`);
    const editor = page.getByTestId("editor-content");
    await expect(editor).toBeVisible({ timeout: budget(20_000) });

    const undo = page.getByTestId("editor-toolbar-undo");
    const redo = page.getByTestId("editor-toolbar-redo");

    // Nothing has been typed, so there is nothing to promise.
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();

    await editor.click();
    await page.keyboard.type(TYPED);
    await expect(editor).toContainText(TYPED, { timeout: budget(10_000) });
    const written = (await editor.innerText()).trim();

    // The history plugin said there is something to go back to. Without
    // this the click below could pass against a permanently dead button.
    await expect(undo).toBeEnabled({ timeout: budget(10_000) });

    await undo.click();
    await expect
      .poll(async () => (await editor.innerText()).trim(), {
        timeout: budget(10_000),
      })
      .not.toBe(written);

    // And forward again — exactly what was there, which is the assertion a
    // redo that merely "did something" would fail.
    await expect(redo).toBeEnabled({ timeout: budget(10_000) });
    await redo.click();
    await expect(editor).toContainText(TYPED, { timeout: budget(10_000) });
    expect((await editor.innerText()).trim()).toBe(written);
  });
});
