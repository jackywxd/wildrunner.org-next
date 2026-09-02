/**
 * V-TITLE — a named video shows its name, not its filename, everywhere the
 * site labels one.
 *
 * The wall and the share page both label a video by decoding the last
 * segment of its URL, which on the real corpus reads as `馬營2019-final` or
 * `SQ 5050 [2024] H264` — because that was all there was to read.
 * `media.title` is the fix: a member's own name for the file, which
 * `mediaDisplayName` now prefers over every derivation. This pins the path
 * from that column to the two places it is read: the video tile's own label
 * on the wall, and the `<h1>` of its share page.
 *
 * THE FIXTURE PATCHES `title` DIRECTLY rather than driving
 * `MediaDetailDialog`'s form. The field is a plain controlled `<input>` PATCHing
 * the same `/api/media/:id` endpoint every other field in that dialog already
 * uses (`alt`, `raceEdition`, `usage`), none of which has a click-driven
 * journey either — what is worth pinning here is the read side: that a title,
 * however it was set, actually reaches the label.
 *
 * `images.wildrunner.org` is intercepted, the same way gallery-unpublish and
 * gallery-video-poster do and for the same reason: `/gallery` renders the
 * WHOLE wall, not just this fixture, and local dev's R2_PUBLIC_URL points
 * every existing corpus photo at a host this sandbox cannot reach.
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/** 1×1 transparent GIF, answered in-process so no request reaches the server. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/** The same fixture shape gallery-videos.spec.ts uploads: a real ftyp box. */
const MP4_HEADER = Buffer.concat([
  Buffer.from("00000018", "hex"),
  Buffer.from("ftypmp42"),
  Buffer.from("00000000", "hex"),
  Buffer.from("mp42isom"),
  Buffer.alloc(1024),
]);

test.describe("V-TITLE a video's own name, not its filename", () => {
  let mediaId: number | null = null;

  test.afterEach(async ({ request }) => {
    if (mediaId === null) return;
    const id = mediaId;
    mediaId = null;
    await deleteCreatedRows(request, [{ collection: "media", id }]);
  });

  test("V-TITLE-T1: a named video's title is the label on the wall and the share page's heading", async ({
    page,
    request,
  }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    // Deliberately filename-derivation-unfriendly, the same shape as the
    // corpus rows that motivated this: separators and a bracketed tag that
    // would otherwise leak into a label built from the file's own name.
    const filename = `v-title-[raw]-${stamp}.mp4`;
    const givenName = `馬營新年首跑 ${stamp}`;

    const uploaded = await request.post("/api/media", {
      multipart: {
        file: { name: filename, mimeType: "video/mp4", buffer: MP4_HEADER },
        _payload: JSON.stringify({ alt: `V-TITLE probe ${stamp}`, usage: "gallery" }),
      },
    });
    expect(uploaded.ok(), `media upload failed: ${uploaded.status()}`).toBeTruthy();
    const doc = (await uploaded.json()).doc as { id: number };
    mediaId = doc.id;
    recordCreated({ collection: "media", id: doc.id, note: "V-TITLE probe" });

    // What the member dialog's save() sends — see its own comment on why
    // this is not routed through a click on the field.
    const patched = await request.patch(`/api/media/${doc.id}`, {
      data: { title: givenName },
    });
    expect(patched.ok(), `title update failed: ${patched.status()}`).toBeTruthy();

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    await page.goto("/gallery", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("gallery-all-photos")).toBeVisible({
      timeout: budget(20_000),
    });

    // The wall's own label, and the filename-derived reading must not
    // appear anywhere the title now covers — a stray fragment of the raw
    // filename in the label would mean the derivation ran anyway.
    await expect(
      page.getByText(givenName, { exact: false }).first(),
      "the video tile should show the given name, not a filename derivation",
    ).toBeVisible({ timeout: budget(15_000) });

    await page.goto(`/gallery/m/${doc.id}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { level: 1, name: givenName }),
      "the share page's heading should be the given name",
    ).toBeVisible({ timeout: budget(15_000) });
  });
});
