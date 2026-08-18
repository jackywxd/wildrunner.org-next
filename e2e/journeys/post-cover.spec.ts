/**
 * A member sets, keeps, replaces and clears their post's cover image.
 *
 * `posts.image` had no control in the member editor at all, which is why
 * every member-written post shared as a flat generated card no matter how
 * many photographs it contained (src/lib/postOg.ts). Adding one changed a
 * load-bearing detail: `PostEditor` used to omit the `image` key entirely,
 * so a PATCH left whatever was stored alone and a cover could not be lost
 * by accident. It now sends the key on *every* save, because otherwise
 * "remove" cannot be expressed — absent and null would mean the same thing.
 *
 * That trade is the reason for this journey, and specifically for its
 * middle act. If `initial.cover` were ever wired wrong — left null, read
 * from the wrong field, dropped by a depth change — then every ordinary
 * save of an untouched post would silently destroy its cover, and nothing
 * on screen would say so. The member would only find out when the article
 * was shared. So this does not merely check that setting a cover works: it
 * reloads the editor and saves *without touching the field*, and asserts
 * the cover is still there.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";

/** A real raster already in the repo — see race-photos.spec.ts, same idea. */
const COVER_FILE = "public/static/brand/lockup-horizontal.png";

const SOURCE = ["# M-COVER 封面測試文章", "", "一段內文，讓這篇文章有東西可讀。"].join("\n");

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/members/login", { waitUntil: "domcontentloaded" });
  await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
  await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
  await page.getByTestId("member-login-submit").click();
  await expect(page).toHaveURL(/\/members$/, { timeout: 15_000 });
}

test.describe("M-COVER a member manages their post's cover image", () => {
  /** Captured the moment each exists, and deleted by id and nothing else. */
  let postId: string | null = null;
  let mediaId: number | null = null;

  test.afterEach(async ({ request }) => {
    const post = postId;
    const media = mediaId;
    postId = null;
    mediaId = null;

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    if (!login.ok()) throw new Error(`teardown could not sign in: ${login.status()}`);

    // The post first: it references the media, and Payload would refuse to
    // leave a post pointing at a row that no longer exists.
    if (post) {
      const deleted = await request.delete(`/api/posts/${post}`);
      if (!deleted.ok() && deleted.status() !== 404) {
        throw new Error(`teardown failed to delete posts/${post}: ${deleted.status()}`);
      }
    }
    if (media !== null) {
      const deleted = await request.delete(`/api/media/${media}`);
      if (!deleted.ok() && deleted.status() !== 404) {
        throw new Error(`teardown failed to delete media/${media}: ${deleted.status()}`);
      }
    }
  });

  test("M-COVER-T1: sets a cover, keeps it across an untouched save, then clears it", async ({
    page,
  }) => {
    // Signs in, imports, uploads a real file through the direct-upload path,
    // and saves four times over five navigations.
    test.setTimeout(90_000);

    await signIn(page);

    // A post to work on, created through the real import screen rather than
    // by POSTing one into existence.
    await page.getByTestId("member-nav-posts").click();
    await page.getByTestId("posts-import").click();
    await expect(page).toHaveURL(/\/members\/posts\/import$/, { timeout: 15_000 });
    await page.getByTestId("import-source").fill(SOURCE);
    await page.getByTestId("import-parse").click();
    await expect(page.getByTestId("import-title")).toHaveValue("M-COVER 封面測試文章", {
      timeout: 10_000,
    });
    await page.getByTestId("import-create").click();
    await expect(page).toHaveURL(/\/members\/posts\/\d+$/, { timeout: 20_000 });

    const created = page.url().match(/\/members\/posts\/(\d+)/);
    if (!created) throw new Error(`no post id in ${page.url()}`);
    postId = created[1];
    const postUrl = page.url();

    // Act 1 — an imported post starts with no cover, which is the whole
    // reason the fallback chain in postOg.ts exists.
    await expect(page.getByTestId("post-cover-empty")).toBeVisible();

    // Act 2 — set one.
    await page.getByTestId("post-cover-file").setInputFiles(COVER_FILE);
    await expect(page.getByTestId("post-cover-image")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿", {
      timeout: 20_000,
    });

    const afterSet = await page.request.get(`/api/posts/${postId}?depth=0&draft=true`);
    expect(afterSet.ok()).toBe(true);
    const set = (await afterSet.json()) as { image?: number | null };
    expect(typeof set.image).toBe("number");
    mediaId = set.image as number;

    // Act 3 — the guard this journey exists for. Reload the editor and save
    // again without going near the cover field. `PostEditor` sends `image`
    // on every save now, so a wrongly-wired `initial.cover` would clear it
    // here, silently.
    await page.goto(postUrl, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("post-cover-image")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("post-description").fill("M-COVER 摘要，只改這裡");
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿", {
      timeout: 20_000,
    });

    const afterUntouched = await page.request.get(`/api/posts/${postId}?depth=0&draft=true`);
    const untouched = (await afterUntouched.json()) as {
      description?: string;
      image?: number | null;
    };
    // Both halves matter: the description proves the save actually happened,
    // so an unchanged `image` cannot be explained away as "nothing was
    // written at all".
    expect(untouched.description).toBe("M-COVER 摘要，只改這裡");
    expect(untouched.image).toBe(mediaId);

    // Act 4 — clearing it has to reach the database, which is the case that
    // omitting the key could never express.
    await page.getByTestId("post-cover-remove").click();
    await expect(page.getByTestId("post-cover-empty")).toBeVisible();
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿", {
      timeout: 20_000,
    });

    const afterRemove = await page.request.get(`/api/posts/${postId}?depth=0&draft=true`);
    const removed = (await afterRemove.json()) as { image?: number | null };
    expect(removed.image ?? null).toBeNull();
  });
});
