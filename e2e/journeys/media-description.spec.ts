import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * V-DESC — a caption a member writes reaches the page that shows the photo.
 *
 * THE FAILURE THIS PROTECTS AGAINST is the one a new column on `media`
 * reliably produces: the field is added, the dialog saves it, the API returns
 * it perfectly — and it renders nowhere, because a `select` somewhere between
 * them does not name it. `src/lib/content.ts` fetches media through
 * `GALLERY_MEDIA_SELECT`, so a field left out of that list is `undefined` on
 * every public page with no error anywhere. Nothing else in the suite can see
 * that: an API test reads the row directly and passes.
 *
 * Both destinations are asserted, because they are two different mappings of
 * the same column and either can drop it in silence: the share page reads the
 * item directly, the lightbox reads it through `toGridPhotos` into the
 * Captions plugin's own `description` slot.
 *
 * Drives the real dialog rather than PATCHing the row: this is a member
 * writing a caption, and the control they use is half of what is being
 * claimed. The photo itself is uploaded over the API — `P-PHOTO` already
 * drives the dropzone.
 */

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
);

async function stubImages(page: import("@playwright/test").Page) {
  await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
    route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
  );
}

test.describe("V-DESC a caption written in the library reaches the public page", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length);
    await deleteCreatedRows(request, pending);
  });

  test("V-DESC-T1: a description saved in the dialog is rendered on the share page", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: `v-desc-${stamp}.svg`,
          mimeType: "image/svg+xml",
          buffer: SVG,
        },
        // `usage` explicit rather than riding the field default: the share
        // page filters on `usage: 'gallery'` (getGalleryMediaById), so a
        // fixture leaning on the default stops pinning anything the day the
        // default moves.
        _payload: JSON.stringify({ alt: `V-DESC ${stamp}`, usage: "gallery" }),
      },
    });
    expect(uploaded.ok(), `upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = ((await uploaded.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "V-DESC probe" });

    /** Two lines, because the control is a textarea and the page renders
     *  `whitespace-pre-line` — a single line would not notice that breaking. */
    const caption = `終點前最後一個彎 ${stamp}\n第二行`;

    await stubImages(page);
    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    await expect(page).toHaveURL(/\/members$/, { timeout: budget(20_000) });

    await page.getByTestId("member-nav-media").click();
    await expect(page.getByTestId("media-grid")).toBeVisible({
      timeout: budget(20_000),
    });

    await page.getByTestId(`media-item-${mediaId}`).click();
    const dialog = page.getByTestId("media-detail-dialog");
    await expect(dialog).toBeVisible({ timeout: budget(10_000) });

    await dialog.getByTestId("media-detail-description").fill(caption);
    await dialog.getByTestId("media-detail-save").click();
    await expect(dialog).toBeHidden({ timeout: budget(20_000) });

    // THE ASSERTION THIS FILE EXISTS FOR. Everything up to here would pass
    // with `description` missing from GALLERY_MEDIA_SELECT.
    await page.goto(`/gallery/m/${mediaId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("media-description")).toHaveText(caption, {
      timeout: budget(20_000),
    });

    // And it is the page's own description, not the site blurb every share
    // used to carry.
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      caption,
    );

    // The other place the caption goes, through a different mapping:
    // `toGridPhotos` → the lightbox's own `description` slot. Two lines that
    // fail silently if either is missed, exactly as the `select` above does.
    await page.goto("/gallery", { waitUntil: "domcontentloaded" });
    const grid = page.getByTestId("gallery-all-photos");
    await expect(grid).toBeVisible({ timeout: budget(20_000) });
    // `load`, not `domcontentloaded`: the album's onClick is React's, and a
    // click landing before hydration is silently dropped.
    await page.waitForLoadState("load");
    await grid.locator("img").first().click();
    // `.first()` is the newest upload — the wall is newest-first and this
    // photo was created seconds ago — but that is an assumption, so it is
    // checked rather than relied on: the share button carries the id of
    // whatever the lightbox is actually showing.
    await expect(page.getByTestId("gallery-share")).toHaveAttribute(
      "href",
      `/gallery/m/${mediaId}`,
      { timeout: budget(15_000) },
    );
    await expect(page.locator(".yarl__slide_description").first()).toContainText(
      `終點前最後一個彎 ${stamp}`,
      { timeout: budget(15_000) },
    );
  });
});
