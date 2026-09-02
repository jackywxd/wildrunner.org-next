/**
 * V-POSTER — a video with a poster draws its own frame on the wall.
 *
 * The grid renders every video as a dark card with a play glyph, because
 * nothing was stored to draw one from. The transcoder container now takes a
 * frame a second into each video it handles and writes it to
 * `posters/<id>.jpg`; `media.posterUrl` is where that lands, and this pins
 * the path from that column to the pixels: posterUrl → mediaToSiteVideo's
 * `poster` → GridPhoto → VideoCard.
 *
 * THE FIXTURE SETS THE COLUMN DIRECTLY, and cannot do otherwise. Only the
 * container can produce a real poster, ffmpeg only exists inside it, and it
 * is only reachable from a deployed Worker — `startTranscode()` returns false
 * in dev and CI because the `TRANSCODER` binding is absent. So what is
 * testable here is everything downstream of the column, which is exactly the
 * part that lives in this repository and can be broken by a refactor. That
 * the container fills the column in is verified on staging, by running one
 * real video through it.
 *
 * Both states are asserted, not just the new one: the fallback card is what
 * every video without a poster still gets — 22 of 22 locally the day this was
 * written — so a change that drew a broken image for them would be the more
 * likely regression, and it would be invisible to a test that only ever looks
 * at a video that has one.
 *
 * T2 COVERS THE OTHER HALF, and it was missing for as long as this file has
 * existed. `poster` reached the wall's tile and stopped there: the lightbox
 * builds its own slide objects, and that object never carried the field. So a
 * video showed its frame on the wall and a black box the moment it was
 * opened, with every thumbnail in the strip an empty play glyph — which is
 * how it was reported. On production the day it was fixed, 12 of 26 videos
 * had a `posterUrl` and not one of them was reaching the player.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/** The same fixture shape gallery-videos.spec.ts uploads: a real ftyp box. */
const MP4_HEADER = Buffer.concat([
  Buffer.from("00000018", "hex"),
  Buffer.from("ftypmp42"),
  Buffer.from("00000000", "hex"),
  Buffer.from("mp42isom"),
  Buffer.alloc(1024),
]);

/** 1×1 transparent GIF, answered in-process so no request reaches the server. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

test.describe("V-POSTER a video's own frame on the wall", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length).reverse();
    await deleteCreatedRows(request, pending);
  });

  test("V-POSTER-T1: with a poster the tile draws it; without one it keeps the card", async ({
    page,
    request,
  }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    // Two videos, uploaded in this order so the one WITH a poster is the
    // newer of the pair and the wall's own newest-first order puts it first.
    const stamp = Date.now();
    const upload = async (suffix: string) => {
      const uploaded = await request.post("/api/media", {
        multipart: {
          file: {
            name: `v-poster-${suffix}-${stamp}.mp4`,
            mimeType: "video/mp4",
            buffer: MP4_HEADER,
          },
          _payload: JSON.stringify({
            alt: `V-POSTER ${suffix} ${stamp}`,
            usage: "gallery",
          }),
        },
      });
      expect(uploaded.ok(), `media upload failed: ${uploaded.status()}`).toBeTruthy();
      const id = (await uploaded.json()).doc.id as number;
      created.push({ collection: "media", id });
      recordCreated({ collection: "media", id, note: `V-POSTER ${suffix}` });
      return id;
    };

    const bare = await upload("bare");
    const withPoster = await upload("with");

    // What the transcoder's callback writes. `posterUrl` is `readOnly` in the
    // admin panel only — that flag never reaches the REST API — so this is
    // the same write the container's report performs.
    const posterUrl = `https://images.wildrunner.org/posters/${withPoster}.jpg`;
    const patched = await request.patch(`/api/media/${withPoster}`, {
      data: { posterUrl },
    });
    expect(patched.ok(), `poster update failed: ${patched.status()}`).toBeTruthy();

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    await page.goto("/gallery", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("gallery-all-photos")).toBeVisible({
      timeout: budget(20_000),
    });

    // The poster's own element, addressed through the tile that owns it, so
    // this cannot pass on some other video's frame.
    const posterImg = page.getByTestId("gallery-video-poster").first();
    await expect(posterImg, "a video with a poster should draw it").toBeVisible({
      timeout: budget(15_000),
    });
    // Asserted on `srcset` rather than `src`: next/image's custom loader
    // rewrites both, and `src` is only the largest fallback candidate.
    await expect(posterImg).toHaveAttribute("srcset", new RegExp(`posters/${withPoster}\\.jpg`));

    // ...and the one without a poster still gets a card and no image. The
    // count is the assertion: two video tiles are on the wall from this test
    // and exactly one of them draws a frame.
    const tiles = page.getByTestId("gallery-video-tile");
    const posters = page.getByTestId("gallery-video-poster");
    expect(
      await posters.count(),
      "only the video that has a poster should draw one",
    ).toBe(1);
    expect(
      await tiles.count(),
      "both videos should still be on the wall as tiles",
    ).toBeGreaterThanOrEqual(2);
    expect(bare).toBeGreaterThan(0);
  });

  test("V-POSTER-T2: opening that video carries the poster into the player and the thumbnails", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const filename = `v-poster-open-${stamp}.mp4`;
    const uploaded = await request.post("/api/media", {
      multipart: {
        file: {
          name: filename,
          mimeType: "video/mp4",
          buffer: MP4_HEADER,
        },
        _payload: JSON.stringify({
          alt: `V-POSTER open ${stamp}`,
          usage: "gallery",
        }),
      },
    });
    expect(uploaded.ok(), `media upload failed: ${uploaded.status()}`).toBeTruthy();
    const mediaId = (await uploaded.json()).doc.id as number;
    created.push({ collection: "media", id: mediaId });
    recordCreated({ collection: "media", id: mediaId, note: "V-POSTER open" });

    const posterUrl = `https://images.wildrunner.org/posters/${mediaId}.jpg`;
    const patched = await request.patch(`/api/media/${mediaId}`, {
      data: { posterUrl },
    });
    expect(patched.ok(), `poster update failed: ${patched.status()}`).toBeTruthy();

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    await page.goto("/gallery", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("gallery-all-photos")).toBeVisible({
      timeout: budget(20_000),
    });
    // `load`, not `domcontentloaded`: the album's onClick is React's, and a
    // click landing before hydration is silently dropped.
    await page.waitForLoadState("load");

    // The newest upload is first under the wall's default order, and it is
    // the only video tile this test made. Opened through its own tile so the
    // slide that opens is this video and not whatever else is on the wall.
    await page.getByTestId("gallery-video-tile").first().click();

    // THE ASSERTION THIS TEST EXISTS FOR. The lightbox's `<video>` takes its
    // placeholder from the slide's `poster`, which the grid was not setting —
    // so this attribute was absent no matter what the column held.
    //
    // Addressed through its own `<source>`, not `.first()`. The carousel keeps
    // the previous and next slides mounted either side of the current one, so
    // the first `video` in the document is the *neighbouring* video — a corpus
    // clip with no poster. The first version of this assertion read that one
    // and reported an empty attribute, which looks exactly like the bug it was
    // written to catch.
    const player = page.locator(`video:has(source[src*="${filename}"])`);
    await expect(player).toBeVisible({ timeout: budget(15_000) });
    await expect(player).toHaveAttribute("poster", posterUrl);

    // And the strip below it, which reads the same field and was drawing an
    // empty play glyph for every video on the page.
    await expect(
      page.locator(`.yarl__thumbnails_container img[src*="posters/${mediaId}.jpg"]`).first(),
      "the thumbnail strip draws the frame too",
    ).toBeVisible({ timeout: budget(15_000) });
  });
});
