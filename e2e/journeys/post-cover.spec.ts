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
import { budget } from "../helpers/budget";
import { getWithRetry } from "../helpers/request";
import { deleteCreatedRows, leavePostEditor } from "../helpers/teardown";

/**
 * The same fixture race-photos.spec.ts uploads, and for a reason worth
 * stating: it MUST NOT be a raster.
 *
 * `.gitattributes` tracks every `*.png/jpg/webp/...` through Git LFS, and
 * the e2e job checks out with `lfs: false` and `GIT_LFS_SKIP_SMUDGE: "1"`.
 * So in CI a PNG on disk is a ~130-byte text pointer, not an image — the
 * upload "succeeds", the media document has nothing usable behind it, and
 * the thumbnail never appears. Measured: this test passed locally and
 * failed in CI at exactly that assertion with `lockup-horizontal.png`.
 * SVG is not LFS-tracked, so it is the same bytes in both places.
 */
const COVER_FILE = "public/static/brand/mark-purple.svg";

const SOURCE = ["# M-COVER 封面測試文章", "", "一段內文，讓這篇文章有東西可讀。"].join("\n");

/** A distinct title, so a row left behind by one test cannot be mistaken for
 *  the other's — the two run in the same file against the same account. */
const PICKER_SOURCE = [
  "# M-COVER 媒體庫測試文章",
  "",
  "一段內文，讓這篇文章有東西可讀。",
].join("\n");

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/members/login", { waitUntil: "domcontentloaded" });
  await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
  await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
  await page.getByTestId("member-login-submit").click();
  await expect(page).toHaveURL(/\/members$/, { timeout: budget(15_000) });
}

test.describe("M-COVER a member manages their post's cover image", () => {
  /** Captured the moment each exists, and deleted by id and nothing else. */
  let postId: string | null = null;
  let mediaId: number | null = null;

  test.afterEach(async ({ page, request }) => {
    const post = postId;
    const media = mediaId;
    postId = null;
    mediaId = null;
    await leavePostEditor(page);
    const pending: { collection: string; id: number | string }[] = [];
    if (post) pending.push({ collection: "posts", id: post });
    if (media !== null) pending.push({ collection: "media", id: media });
    await deleteCreatedRows(request, pending);
  });

  test("M-COVER-T1: sets a cover, keeps it across an untouched save, then clears it", async ({
    page,
  }) => {
    // Signs in, imports, uploads a real file through the direct-upload path,
    // and saves four times over five navigations.
    test.setTimeout(budget(90_000));

    await signIn(page);

    // A post to work on, created through the real import screen rather than
    // by POSTing one into existence.
    await page.getByTestId("member-nav-posts").click();
    await page.getByTestId("posts-import").click();
    await expect(page).toHaveURL(/\/members\/posts\/import$/, { timeout: budget(15_000) });
    await page.getByTestId("import-source").fill(SOURCE);
    await page.getByTestId("import-parse").click();
    await expect(page.getByTestId("import-title")).toHaveValue("M-COVER 封面測試文章", {
      timeout: budget(10_000),
    });
    await page.getByTestId("import-create").click();
    await expect(page).toHaveURL(/\/members\/posts\/\d+$/, { timeout: budget(20_000) });

    const created = page.url().match(/\/members\/posts\/(\d+)/);
    if (!created) throw new Error(`no post id in ${page.url()}`);
    postId = created[1];
    const postUrl = page.url();

    // Act 1 — an imported post starts with no cover, which is the whole
    // reason the fallback chain in postOg.ts exists.
    await expect(page.getByTestId("post-cover-empty")).toBeVisible();

    // Act 2 — set one.
    await page.getByTestId("post-cover-file").setInputFiles(COVER_FILE);
    await expect(page.getByTestId("post-cover-image")).toBeVisible({ timeout: budget(30_000) });
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿", {
      timeout: budget(20_000),
    });

    const afterSet = await getWithRetry(
      page.request,
      `/api/posts/${postId}?depth=0&draft=true`,
    );
    expect(afterSet.ok()).toBe(true);
    const set = (await afterSet.json()) as { image?: number | null };
    expect(typeof set.image).toBe("number");
    mediaId = set.image as number;

    // The cover the member just picked must NOT land on the public photo
    // wall. `media.usage` defaults to 'gallery' so that a library upload is
    // published without anyone having to opt in, which puts the burden on the
    // article paths to say otherwise — and both of them (this field and the
    // editor's paste plugin) go through the one seam,
    // src/lib/members/upload-image.ts. Asserted here rather than in a journey
    // of its own because this test already drives that seam, and the failure
    // is observable at exactly this point: a cover classified as photo-wall
    // content shows up on /gallery with nothing on screen to say so.
    const coverMedia = await getWithRetry(page.request, `/api/media/${mediaId}?depth=0`);
    expect(coverMedia.ok()).toBe(true);
    expect(((await coverMedia.json()) as { usage?: string }).usage).toBe("attachment");

    // Act 3 — the guard this journey exists for. Reload the editor and save
    // again without going near the cover field. `PostEditor` sends `image`
    // on every save now, so a wrongly-wired `initial.cover` would clear it
    // here, silently.
    await page.goto(postUrl, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("post-cover-image")).toBeVisible({ timeout: budget(20_000) });
    await page.getByTestId("post-description").fill("M-COVER 摘要，只改這裡");
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿", {
      timeout: budget(20_000),
    });

    const afterUntouched = await getWithRetry(
      page.request,
      `/api/posts/${postId}?depth=0&draft=true`,
    );
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
      timeout: budget(20_000),
    });

    const afterRemove = await getWithRetry(
      page.request,
      `/api/posts/${postId}?depth=0&draft=true`,
    );
    const removed = (await afterRemove.json()) as { image?: number | null };
    expect(removed.image ?? null).toBeNull();
  });

  /**
   * The second way to set a cover, and the reason it exists.
   *
   * Until the picker landed, every member-facing route to a picture in a post
   * was an upload. A member who had already put a photo in their library had
   * no way to reuse it — they uploaded the same bytes again, paying their
   * quota twice and leaving two rows that mean one thing.
   *
   * Driven through the real dialog rather than by PATCHing `posts.image`: the
   * claim being made is that a *person* can do this, and a PATCH would prove
   * only that the column accepts a number, which M-COVER-T1 already shows.
   *
   * The file it picks is one this test uploaded moments earlier, not whatever
   * the corpus happens to hold. A spec that reaches for ambient data passes
   * here and fails in CI, where the library starts from the seed.
   */
  test("M-COVER-T2: picks a cover from the media library instead of uploading", async ({
    page,
  }) => {
    test.setTimeout(budget(90_000));

    await signIn(page);

    await page.getByTestId("member-nav-posts").click();
    await page.getByTestId("posts-import").click();
    await expect(page).toHaveURL(/\/members\/posts\/import$/, { timeout: budget(15_000) });
    await page.getByTestId("import-source").fill(PICKER_SOURCE);
    await page.getByTestId("import-parse").click();
    await expect(page.getByTestId("import-title")).toHaveValue("M-COVER 媒體庫測試文章", {
      timeout: budget(10_000),
    });
    await page.getByTestId("import-create").click();
    await expect(page).toHaveURL(/\/members\/posts\/\d+$/, { timeout: budget(20_000) });

    const created = page.url().match(/\/members\/posts\/(\d+)/);
    if (!created) throw new Error(`no post id in ${page.url()}`);
    postId = created[1];

    // A file in the library to find. Uploading it through the cover field is
    // the cheapest way to get one that this account owns and this test can
    // delete — the picker cannot tell how a row got there.
    await page.getByTestId("post-cover-file").setInputFiles(COVER_FILE);
    await expect(page.getByTestId("post-cover-image")).toBeVisible({ timeout: budget(30_000) });
    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿", {
      timeout: budget(20_000),
    });

    const uploaded = await getWithRetry(
      page.request,
      `/api/posts/${postId}?depth=0&draft=true`,
    );
    mediaId = ((await uploaded.json()) as { image?: number | null }).image as number;
    expect(typeof mediaId).toBe("number");

    // Clear it, so what the picker sets cannot be confused with what the
    // upload already set.
    await page.getByTestId("post-cover-remove").click();
    await expect(page.getByTestId("post-cover-empty")).toBeVisible();

    await page.getByTestId("post-cover-library").click();
    await expect(page.getByTestId("media-picker")).toBeVisible({ timeout: budget(20_000) });

    const tile = page.getByTestId(`media-item-${mediaId}`);
    await expect(tile).toBeVisible({ timeout: budget(20_000) });
    // Each tile says what the file is for. A member choosing a cover is
    // publishing that file, and this label is the only place they could learn
    // beforehand that the photo they picked is one they marked 不公開.
    await expect(tile.getByTestId("media-item-usage")).toHaveText("文章附件");

    await tile.click();
    await expect(page.getByTestId("media-picker")).toBeHidden();
    await expect(page.getByTestId("post-cover-image")).toBeVisible({ timeout: budget(20_000) });

    await page.getByTestId("post-save-draft").click();
    await expect(page.getByTestId("post-message")).toHaveText("已儲存草稿", {
      timeout: budget(20_000),
    });

    const afterPick = await getWithRetry(
      page.request,
      `/api/posts/${postId}?depth=0&draft=true`,
    );
    expect(((await afterPick.json()) as { image?: number | null }).image).toBe(mediaId);
  });
});
