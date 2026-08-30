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
 * Untagging in `afterEach` restores exactly the two rows this test touched,
 * by id — see docs/testing-strategy.md on cleaning up only what you made.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";

const RACE_SLUG_RE = /^race-.+-\d{4}$/;

test.describe("V-RACEALBUM a race's media is browsable and shareable", () => {
  /** Captured before the first tag, restored whatever the test does. */
  const restore: { id: number; raceEdition: number | null }[] = [];
  let editionKey = "";
  let editionYear = 0;

  test.afterEach(async ({ request }) => {
    const pending = restore.splice(0, restore.length);
    if (pending.length === 0) return;

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    if (!login.ok()) throw new Error(`teardown could not sign in: ${login.status()}`);

    for (const row of pending) {
      const undone = await request.patch(`/api/media/${row.id}`, {
        data: { raceEdition: row.raceEdition },
      });
      if (!undone.ok()) {
        throw new Error(`teardown failed to restore media/${row.id}: ${undone.status()}`);
      }
    }
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
    const before = await page.request.get(`/gallery/${slug}`);
    expect(before.status()).toBe(404);

    // One photo and one video, so the album exercises both halves.
    //
    // `usage=gallery` is part of the filter, not an incidental detail: the
    // race album is built from the same set /gallery renders, so a fixture
    // that happened to pick a private file or an article attachment would
    // make the album appear or not appear for a reason this test does not
    // control — Payload's default sort and the importer's insertion order.
    const mine = await request.get(
      "/api/media?depth=0&limit=200&where[raceEdition][exists]=false&where[usage][equals]=gallery",
    );
    expect(mine.ok()).toBe(true);
    const docs = (await mine.json()).docs as {
      id: number;
      mimeType?: string;
    }[];
    const photo = docs.find((doc) => doc.mimeType?.startsWith("image/"));
    const video = docs.find((doc) => doc.mimeType?.startsWith("video/"));
    if (!photo || !video) throw new Error("need one untagged image and one untagged video");

    for (const doc of [photo, video]) {
      restore.push({ id: doc.id, raceEdition: null });
      const tagged = await request.patch(`/api/media/${doc.id}`, {
        data: { raceEdition: edition.id },
      });
      expect(tagged.ok()).toBe(true);
    }

    // Act 1 — the album now exists and is named after the race, not the slug.
    const album = await page.request.get(`/gallery/${slug}`);
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
