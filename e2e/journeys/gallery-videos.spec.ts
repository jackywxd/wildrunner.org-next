import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * V-GALLERYVIDEO — a gallery's video is visible on /gallery without
 * changing anything first.
 *
 * This is the test that was missing. `/gallery` has two views, and the one
 * a visitor lands on rendered only *race-tagged* videos: a video that lives
 * in an album and carries no race tag appeared nowhere on the page, while
 * the album's own page showed it correctly. On production that was 23 of
 * the 25 videos in albums. The suite stayed green throughout, because
 * nothing asserted about the default view's videos at all — the same shape of
 * blind spot AGENTS.md records for the calendar toggle.
 *
 * So the assertion is deliberately made *before any interaction*. Clicking
 * "依相簿" first would pass against the broken code, which is exactly how
 * this went unnoticed: every path that a test or a developer took to check
 * "do videos work" went through the album view or an album page, and both
 * were fine.
 *
 * The fixture is created over the API rather than through the upload UI.
 * Uploading is not the subject here — `race-photos.spec.ts` covers a member
 * actually doing it — and this needs a video in a *stored gallery*, which
 * no amount of UI driving produces in one step. Both rows are deleted by
 * the ids captured at creation, per docs/testing-strategy.md.
 */

/**
 * The smallest bytes Payload's type sniffing accepts as `video/mp4`.
 *
 * A real `ftyp` box, because the upload is rejected on content rather than
 * on the filename — an empty file named `.mp4` comes back as
 * "File type text/plain (from extension mp4) is not allowed". Nothing ever
 * decodes this: the test asserts the element is rendered, not that it plays.
 */
const MP4_HEADER = Buffer.concat([
  Buffer.from("00000018", "hex"),
  Buffer.from("ftypmp42"),
  Buffer.from("00000000", "hex"),
  Buffer.from("mp42isom"),
  Buffer.alloc(1024),
]);

test.describe("V-GALLERYVIDEO a gallery video is visible on /gallery", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length).reverse();
    await deleteCreatedRows(request, pending);
  });

  test("V-GALLERYVIDEO-T1: an album's video shows on the landing view, unclicked", async ({
    page,
    request,
  }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: `gallery-video-${stamp}.mp4`,
          mimeType: "video/mp4",
          buffer: MP4_HEADER,
        },
        // `usage` is explicit even though 'gallery' is the field default:
        // what this test pins is that an album's video shows on the landing
        // view, and a fixture that silently depended on a default would stop
        // pinning it the day the default changed.
        _payload: JSON.stringify({
          alt: `V-GALLERYVIDEO probe ${stamp}`,
          usage: "gallery",
        }),
      },
    });
    expect(uploaded.ok(), `media upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = (await uploaded.json()).doc.id as number;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "V-GALLERYVIDEO probe video" });

    // No images on purpose. A gallery of one video is the case the broken
    // code could not render at all, and it keeps the assertion below
    // unambiguous — any <video> on the page is this one.
    const gallery = await request.post("/api/galleries", {
      data: {
        name: `V-GALLERYVIDEO ${stamp}`,
        slug: `v-galleryvideo-${stamp}`,
        _status: "published",
        items: [{ media: mediaId }],
      },
    });
    expect(gallery.ok(), `gallery create failed: ${gallery.status()}`).toBeTruthy();
    const galleryId = (await gallery.json()).doc.id as number;
    created.push({ collection: "galleries", id: galleryId });
    recordCreated({ collection: "galleries", id: galleryId, note: "V-GALLERYVIDEO probe album" });

    await page.goto("/gallery");

    // Nothing is clicked before this. The view toggle is present and the
    // page lands on "全部相片"; asserting here is what pins the bug.
    await expect(page.getByTestId("gallery-view-toggle")).toBeVisible({
      timeout: budget(15_000),
    });
    // The video is a tile in the one grid now, not a rail above it. The old
    // assertion looked for `gallery-all-photos-videos`, the strip's wrapper,
    // and for a `direct-video` player rendered unclicked — both are gone with
    // the strip. The claim this spec makes is unchanged, so the assertion
    // follows the claim rather than the markup: the video is on the wall
    // without anything being clicked.
    const tile = page.getByTestId("gallery-video-tile").first();
    await expect(tile).toBeVisible({ timeout: budget(15_000) });

    // ...and clicking it opens a player. The strip could only ever show a
    // black box — a `<video preload="none">` with no poster — so "visible"
    // there proved less than it looked. Nothing here decodes the fixture
    // either (see MP4_HEADER); what is new is that the element a viewer would
    // press play on has to exist.
    await tile.click();
    await expect(page.locator("video").first()).toBeVisible({
      timeout: budget(15_000),
    });
  });
});
