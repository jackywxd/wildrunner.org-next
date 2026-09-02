import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * V-BGM — an album with background music plays it while its slideshow runs,
 * and stops when asked.
 *
 * WHAT IS ASSERTED AND WHAT DELIBERATELY IS NOT. Whether YouTube emits audio
 * is YouTube's, over the network, and a test that waited for it would be
 * testing the vendor while making the suite depend on reaching
 * youtube-nocookie.com. What is ours is the wiring: the mute control exists,
 * the player is mounted exactly when the slideshow is running, it is built
 * from an id this codebase parsed rather than from a stored string, and it is
 * gone the moment the visitor closes the lightbox or mutes it.
 *
 * That last clause is the one worth a browser. `SlideshowMusic` stops by
 * being unmounted, so "did the music stop" is a DOM question — which is
 * exactly why the component was built that way rather than around a
 * `postMessage` protocol whose silence is indistinguishable from working.
 *
 * The album is created and deleted by this test. Setting `musicUrl` on a
 * corpus album would mean a teardown that restores a previous value, and a
 * teardown that has to put something back is one that leaves the corpus wrong
 * whenever it does not run.
 */

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
);

/** A real, well-formed video id — the parser accepts nothing else. */
const VIDEO_ID = "dQw4w9WgXcQ";

test.describe("V-BGM an album's slideshow carries its background music", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    // Reversed: the gallery references the media, so it goes first.
    const pending = created.splice(0, created.length).reverse();
    await deleteCreatedRows(request, pending);
  });

  test("V-BGM-T1: the player follows the slideshow, and the mute control stops it", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(90_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: `v-bgm-${stamp}.svg`,
          mimeType: "image/svg+xml",
          buffer: SVG,
        },
        _payload: JSON.stringify({ alt: `V-BGM ${stamp}`, usage: "gallery" }),
      },
    });
    expect(uploaded.ok(), `fixture upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = ((await uploaded.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "V-BGM probe" });

    const slug = `v-bgm-${stamp}`;
    const album = await request.post("/api/galleries", {
      data: {
        name: `V-BGM ${stamp}`,
        slug,
        _status: "published",
        // The URL, as an admin would paste it. What the page receives is the
        // id parsed back out of it — see U-GALLERYMUSIC.
        musicUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
        items: [{ media: mediaId, featured: false }],
      },
    });
    expect(album.ok(), `gallery create failed: ${await album.text()}`).toBeTruthy();
    const albumId = ((await album.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "galleries", id: albumId });
    recordCreated({ collection: "galleries", id: albumId, note: "V-BGM album" });

    // Both third parties stubbed in-process. The photo for the reason every
    // gallery spec stubs it, and the player because this test makes no claim
    // about YouTube — leaving it live would make a green run depend on the
    // sandbox reaching the internet, and a red one say nothing about us.
    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );
    await page.route(/youtube-nocookie\.com/, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>" }),
    );

    await page.goto(`/gallery/${slug}`, { waitUntil: "domcontentloaded" });
    // `load`, not `domcontentloaded`: the album's onClick is React's, and a
    // click landing before hydration is silently dropped.
    await page.waitForLoadState("load");
    // Scoped to the album, not `img` on the page: the first image in the
    // document is the header logo, and clicking it navigates home.
    await page.getByTestId("gallery-album").locator("img").first().click();

    const toggle = page.getByTestId("gallery-music-toggle");
    await expect(
      toggle,
      "an album with music must offer a way to silence it — WCAG 1.4.2",
    ).toBeVisible({ timeout: budget(15_000) });

    // Nothing sounds on opening the lightbox. The music is the slideshow's,
    // and a visitor who only wanted to look at one photo hears nothing.
    await expect(toggle).toHaveAttribute("data-playing", "false");
    await expect(page.getByTestId("slideshow-music")).toHaveCount(0);

    await page.getByRole("button", { name: "Play" }).click();

    await expect(toggle).toHaveAttribute("data-playing", "true", {
      timeout: budget(10_000),
    });
    const player = page.getByTestId("slideshow-music");
    await expect(player).toHaveCount(1);
    // Built from the parsed id on the nocookie host — never from the stored
    // URL. This is the assertion that would catch a "simplification" that
    // passed `musicUrl` straight through to the frame.
    await expect(player).toHaveAttribute(
      "src",
      new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${VIDEO_ID}\\?`),
    );

    // Muting is not cosmetic: the frame goes away, which is the only way this
    // component can stop a sound it never had a handle on.
    await toggle.click();
    await expect(toggle).toHaveAttribute("data-playing", "false");
    await expect(player).toHaveCount(0);

    // And un-muting starts it again without needing the slideshow pressed a
    // second time — the control a visitor pressed has to do something.
    await toggle.click();
    await expect(page.getByTestId("slideshow-music")).toHaveCount(1);

    // Closing the lightbox is not a pause. Music continuing behind the page
    // would be the worst version of this feature.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("slideshow-music")).toHaveCount(0, {
      timeout: budget(10_000),
    });

    // ...and closing ENDS the slideshow rather than suspending it. Written
    // after the first version of this test failed to notice: the player also
    // unmounts because the lightbox index resets, so asserting only on the
    // close proves nothing about the slideshow's own state. Reopening is
    // where the difference shows — without `exiting` the album starts singing
    // the moment a visitor clicks a photo, which is precisely what the
    // "nothing sounds on opening" rule above forbids.
    await page.getByTestId("gallery-album").locator("img").first().click();
    await expect(toggle).toBeVisible({ timeout: budget(10_000) });
    await expect(toggle).toHaveAttribute("data-playing", "false");
    await expect(page.getByTestId("slideshow-music")).toHaveCount(0);
  });

  test("V-BGM-T2: an album with no music offers no control", async ({
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
        file: { name: `v-bgm-none-${stamp}.svg`, mimeType: "image/svg+xml", buffer: SVG },
        _payload: JSON.stringify({ alt: `V-BGM none ${stamp}`, usage: "gallery" }),
      },
    });
    expect(uploaded.ok()).toBeTruthy();
    const mediaId = ((await uploaded.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "V-BGM none probe" });

    const slug = `v-bgm-none-${stamp}`;
    const album = await request.post("/api/galleries", {
      data: {
        name: `V-BGM none ${stamp}`,
        slug,
        _status: "published",
        items: [{ media: mediaId, featured: false }],
      },
    });
    expect(album.ok(), await album.text()).toBeTruthy();
    const albumId = ((await album.json()) as { doc: { id: number } }).doc.id;
    created.push({ collection: "galleries", id: albumId });
    recordCreated({ collection: "galleries", id: albumId, note: "V-BGM none album" });

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    await page.goto(`/gallery/${slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await page.getByTestId("gallery-album").locator("img").first().click();

    // The share button proves the lightbox is open, so the absence below is a
    // real absence rather than a page that never got there — the difference
    // between "no control" and "no lightbox" is invisible to a bare
    // `toHaveCount(0)`.
    await expect(page.getByTestId("gallery-share")).toBeVisible({
      timeout: budget(15_000),
    });
    await expect(page.getByTestId("gallery-music-toggle")).toHaveCount(0);
  });
});
