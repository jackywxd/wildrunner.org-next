/**
 * V-ALBUMORDER — an album is drawn in the order it was curated in.
 *
 * `galleries_items` exists because "ordering cannot be expressed across two
 * tables" — the argument #95's migration was written on. #102 stopped
 * `mapPayloadGallery` splitting that one ordered list back into `images` and
 * `videos`, and pinned it with a unit test.
 *
 * Neither of those reached the screen. `PhotoGallery` still drew a video strip
 * and then a photo album, so a curator who arranged video, photo, photo, video
 * still saw video, video, photo, photo. The order existed in the database and
 * in the mapping, and nothing rendered it. That is the gap this closes, and it
 * is the reason a unit test was not enough: both halves were correct and the
 * page was still wrong.
 *
 * Asserted on the DOM order of the tiles, because that is the thing a reader
 * sees. The grid places a video as a 16:9 box among the photos, so kind is
 * read from the tile itself rather than from a separate container.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";

/** 1×1 GIF, answered in-process — see gallery-unpublish.spec.ts for why. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** The ftyp box of a minimal MP4 — enough for Payload to store it as video/mp4. */
const MP4 = Buffer.from(
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQ==",
  "base64",
);

test.describe("V-ALBUMORDER an album keeps its curated order on screen", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    const doomed = created.splice(0, created.length).reverse();
    if (doomed.length === 0) return;

    await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    for (const row of doomed) {
      const deleted = await request.delete(`/api/${row.collection}/${row.id}`);
      if (!deleted.ok() && deleted.status() !== 404) {
        throw new Error(
          `teardown failed to delete ${row.collection}/${row.id}: ${deleted.status()}`,
        );
      }
    }
  });

  test("V-ALBUMORDER-T1: video, photo, video survives to the page", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(60_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const upload = async (name: string, mimeType: string, buffer: Buffer) => {
      const res = await request.post("/api/media", {
        multipart: {
          file: { name, mimeType, buffer },
          _payload: JSON.stringify({ alt: name, usage: "gallery" }),
        },
      });
      expect(res.ok(), `upload ${name} failed: ${res.status()}`).toBeTruthy();
      const id = (await res.json()).doc.id as number;
      created.push({ collection: "media", id });
      recordCreated({ collection: "media", id, note: "V-ALBUMORDER fixture" });
      return id;
    };

    // Deliberately interleaved, and deliberately NOT grouped: an
    // implementation that draws videos first would produce the same three
    // tiles in a different order, which is precisely the bug.
    const firstVideo = await upload(`ao-1-${stamp}.mp4`, "video/mp4", MP4);
    const photo = await upload(`ao-2-${stamp}.png`, "image/png", PNG);
    const lastVideo = await upload(`ao-3-${stamp}.mp4`, "video/mp4", MP4);

    const slug = `ao-${stamp}`;
    const album = await request.post("/api/galleries", {
      data: {
        name: `AO ${stamp}`,
        slug,
        _status: "published",
        items: [{ media: firstVideo }, { media: photo }, { media: lastVideo }],
      },
    });
    expect(album.ok(), `gallery create failed: ${album.status()}`).toBeTruthy();
    const albumId = (await album.json()).doc.id as number;
    created.push({ collection: "galleries", id: albumId });
    recordCreated({ collection: "galleries", id: albumId, note: "V-ALBUMORDER album" });

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    await page.goto(`/gallery/${slug}`, { waitUntil: "domcontentloaded" });

    // One container, read top to bottom. `.react-photo-album--track` is the
    // library's own row wrapper; the assertion is about the sequence of tiles
    // inside the grid, whichever row each lands on.
    const tiles = page.locator(
      "[data-testid='gallery-video-tile'], .react-photo-album img",
    );
    await expect(tiles).toHaveCount(3, { timeout: budget(20_000) });

    const kinds = await tiles.evaluateAll((nodes) =>
      nodes.map((node) =>
        node.getAttribute("data-testid") === "gallery-video-tile"
          ? "video"
          : "photo",
      ),
    );
    expect(kinds, "the album's curated order has to reach the page").toEqual([
      "video",
      "photo",
      "video",
    ]);
  });
});
