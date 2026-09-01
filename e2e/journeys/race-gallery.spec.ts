/**
 * A race with photos or videos is browsable and shareable as an album.
 *
 * The album is virtual — see `src/lib/race-gallery.ts`. Nothing is stored,
 * so there is no row to assert on; what has to hold is that the *derived*
 * album appears where a reader looks for it, and that a race with nothing
 * tagged produces no album at all rather than an empty one.
 *
 * The share half is the part that did not work before. `GalleryVideos`
 * renders a share button only when it is given a gallery slug, and a video
 * reached through a race tag had none — so race videos could be watched and
 * never shared. Act 3 is that gap.
 *
 * Tagging is done over the API rather than through the media dialog: the
 * subject here is the album, not the tagging control, and the tag is setup.
 * The two media are uploaded by this test and deleted by id in `afterEach`
 * — see docs/testing-strategy.md on cleaning up only what you made.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { getWithRetry } from "../helpers/request";
import { deleteCreatedRows } from "../helpers/teardown";

const RACE_SLUG_RE = /^race-.+-\d{4}$/;

/** 1x1 PNG, the same bytes the editor specs upload. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** The smallest bytes Payload sniffs as video/mp4 — see gallery-videos.spec.ts. */
const MP4_HEADER = Buffer.concat([
  Buffer.from("00000018", "hex"),
  Buffer.from("ftypmp42"),
  Buffer.from("00000000", "hex"),
  Buffer.from("mp42isom"),
  Buffer.alloc(1024),
]);

test.describe("V-RACEALBUM a race's media is browsable and shareable", () => {
  /** Uploaded by this test, deleted whatever the test does. */
  const created: { collection: string; id: number }[] = [];
  let editionKey = "";
  let editionYear = 0;

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length);
    await deleteCreatedRows(request, pending);
  });

  test("V-RACEALBUM-T1: tagged media becomes an album, and its video can be shared", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(90_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok()).toBe(true);

    // An edition that has already started — only those can be tagged, and
    // only those can have an album.
    const editions = await request.get("/api/race-editions?depth=1&limit=100");
    expect(editions.ok()).toBe(true);
    const editionDocs = (await editions.json()).docs as {
      id: number;
      year: number;
      startDate?: string;
      event?: { key?: string };
    }[];
    const edition = editionDocs.find(
      (doc) => doc.event?.key && doc.startDate && doc.startDate <= new Date().toISOString(),
    );
    if (!edition) throw new Error("no already-started race edition to tag against");
    editionKey = edition.event!.key!;
    editionYear = edition.year;
    const slug = `race-${editionKey}-${editionYear}`;
    expect(slug).toMatch(RACE_SLUG_RE);

    // Act 0 — the negative, taken BEFORE anything is tagged. Without this
    // the test could pass against an album that was already there, and
    // would prove nothing about tagging.
    const before = await getWithRetry(page.request, `/gallery/${slug}`);
    expect(before.status()).toBe(404);

    // One photo and one video, so the album exercises both halves — uploaded
    // here rather than looked for in the library.
    //
    // This used to search for media matching `raceEdition` absent AND
    // `usage=gallery`. On a seeded local database that set is large, because
    // the importer writes `usage` itself. On a database whose `usage` came
    // from 20260830_090000_add_media_usage the set is **empty by
    // construction**: that migration's entire rule is
    // `race_edition_id IS NOT NULL -> gallery`, so "on the wall" and "not
    // tagged to a race" cannot both hold until a backfill or a member's own
    // upload says so. It passed locally for weeks and threw "need one
    // untagged image and one untagged video" the first time the suite ran
    // against staging with the migration applied.
    //
    // That is the failure AGENTS.md already describes — a spec leaning on
    // ambient data passes where the data happens to suit it — so this makes
    // what it needs. `usage: 'gallery'` stays explicit for the reason
    // gallery-videos.spec.ts gives: a fixture that rides on a field default
    // stops pinning anything the day the default moves.
    const stamp = Date.now();
    const docs: { id: number }[] = [];
    for (const file of [
      { name: `racealbum-${stamp}.png`, mimeType: "image/png", buffer: PNG },
      { name: `racealbum-${stamp}.mp4`, mimeType: "video/mp4", buffer: MP4_HEADER },
    ]) {
      const uploaded = await request.post("/api/media", {
        multipart: {
          file,
          _payload: JSON.stringify({
            alt: `V-RACEALBUM probe ${stamp}`,
            usage: "gallery",
          }),
        },
      });
      expect(uploaded.ok(), `fixture upload failed: ${uploaded.status()}`).toBeTruthy();
      const id = (await uploaded.json()).doc.id as number;
      created.push({ collection: "media", id });
      recordCreated({ collection: "media", id, note: "V-RACEALBUM probe" });
      docs.push({ id });
    }
    const [photo, video] = docs;

    for (const doc of [photo, video]) {
      const tagged = await request.patch(`/api/media/${doc.id}`, {
        data: { raceEdition: edition.id },
      });
      expect(tagged.ok()).toBe(true);
    }

    // Act 1 — the album now exists and is named after the race, not the slug.
    const album = await getWithRetry(page.request, `/gallery/${slug}`);
    expect(album.status()).toBe(200);

    // Act 2 — and it is reachable by clicking, from the albums shelf, rather
    // than only by knowing the URL (docs/testing-strategy.md §4).
    await page.goto("/gallery", { waitUntil: "domcontentloaded" });
    // The chips are server-rendered, so `domcontentloaded` is reached well
    // before React attaches their onClick. Clicking then is silently
    // dropped, the shelf never renders, and the album link is "not found"
    // for a reason that has nothing to do with albums — which is how this
    // failed in CI while passing locally against a warm dev server.
    // `toBeEnabled` waits for the element; `data-active` proves the click
    // actually took effect rather than merely being dispatched.
    const albumsChip = page.getByTestId("gallery-view-albums");
    await expect(albumsChip).toBeEnabled({ timeout: budget(15_000) });
    await expect(async () => {
      await albumsChip.click();
      await expect(albumsChip).toHaveAttribute("data-active", "true", {
        timeout: budget(2_000),
      });
    }).toPass({ timeout: budget(20_000) });

    const albumLink = page.locator(`a[href="/gallery/${slug}"]`).first();
    await expect(albumLink).toBeVisible({ timeout: budget(15_000) });
    await albumLink.click();
    await expect(page).toHaveURL(new RegExp(`/gallery/${slug}$`), { timeout: budget(15_000) });

    // Act 3 — the share link, which is the thing that did not exist before.
    // Its id is the media id: stable across a rename, and unique within the
    // album, which a filename-derived slug is not.
    await page.goto(`/races/${editionKey}/${editionYear}`, {
      waitUntil: "domcontentloaded",
    });
    const share = page.locator(`a[href="/gallery/${slug}/v/${video.id}"]`).first();
    await expect(share).toBeVisible({ timeout: budget(15_000) });
    await share.click();
    await expect(page).toHaveURL(new RegExp(`/v/${video.id}$`), { timeout: budget(15_000) });
    // The share page renders the video itself, not a 404 shell.
    await expect(page.getByTestId("direct-video").first()).toBeVisible({
      timeout: budget(15_000),
    });
  });
});
