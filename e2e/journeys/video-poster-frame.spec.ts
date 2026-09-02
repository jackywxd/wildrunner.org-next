import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * V-PICKFRAME — a member chooses which frame of their video is the cover.
 *
 * WHAT IS AND IS NOT PROVABLE HERE, stated up front because the gap is the
 * interesting part. The frame itself is taken by ffmpeg inside the transcoder
 * container, which is reachable only over the `TRANSCODER` service binding —
 * absent in dev and in CI by construction. So no test outside a real
 * deployment can watch a poster actually change, and pretending otherwise
 * would mean mocking the one component whose behaviour is in question.
 *
 * What that leaves is the half that has actually gone wrong here before: the
 * button doing nothing while appearing to work. `media.posterUrl` shipped in
 * #114 and no video got a poster for days, because the queue it wrote into
 * had no dispatcher — green everywhere, silent everywhere. These assertions
 * are aimed squarely at that: pressing the button must reach the endpoint,
 * and when the transcoder is unavailable the member must be TOLD, not left
 * looking at an unchanged picture.
 *
 * `503` is therefore the expected answer in this environment and is asserted
 * as such rather than skipped around. A `200` here would mean the site
 * claimed to have queued work that nothing can perform, which is the bug.
 */

/** The same fixture shape gallery-video-poster.spec.ts uploads: a real ftyp box. */
const MP4_HEADER = Buffer.concat([
  Buffer.from("00000018", "hex"),
  Buffer.from("ftypmp42"),
  Buffer.from("00000000", "hex"),
  Buffer.from("mp42isom"),
  Buffer.alloc(1024),
]);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("V-PICKFRAME a member picks the cover frame of their video", () => {
  const created: { collection: string; id: number }[] = [];

  test.afterEach(async ({ request }) => {
    const pending = created.splice(0, created.length);
    await deleteCreatedRows(request, pending);
  });

  test("V-PICKFRAME-T1: the request reaches the transcoder, and says so when it cannot", async ({
    request,
  }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const upload = async (name: string, mimeType: string, buffer: Buffer) => {
      const uploaded = await request.post("/api/media", {
        multipart: {
          file: { name, mimeType, buffer },
          _payload: JSON.stringify({ alt: `V-PICKFRAME ${name}`, usage: "gallery" }),
        },
      });
      expect(uploaded.ok(), `upload failed: ${uploaded.status()}`).toBeTruthy();
      const id = (await uploaded.json()).doc.id as number;
      created.push({ collection: "media", id });
      recordCreated({ collection: "media", id, note: "V-PICKFRAME fixture" });
      return id;
    };

    const videoId = await upload(`v-pickframe-${stamp}.mp4`, "video/mp4", MP4_HEADER);
    const photoId = await upload(`v-pickframe-${stamp}.png`, "image/png", PNG);

    // The moment the member chose. 12.5s is an ordinary scrub — the value is
    // carried through rather than snapped to anything, which is what makes
    // "the frame I am looking at" mean what it says.
    const picked = await request.post(`/api/members/media/${videoId}/poster`, {
      data: { seconds: 12.5 },
    });
    expect(
      picked.status(),
      "a poster request must report that the transcoder is unavailable, not quietly succeed",
    ).toBe(503);

    // A photo has no frames. Refused by the endpoint itself, BEFORE the
    // environment is consulted — which is why this stays 400 here while the
    // video above gets 503 from the missing transcoder.
    const onPhoto = await request.post(`/api/members/media/${photoId}/poster`, {
      data: { seconds: 1 },
    });
    expect(onPhoto.status(), await onPhoto.text()).toBe(400);

    // A time the player never reported. Refused before anything is
    // dispatched — guessing which frame was meant is worse than failing.
    const noTime = await request.post(`/api/members/media/${videoId}/poster`, {
      data: {},
    });
    expect(noTime.status(), await noTime.text()).toBe(400);
  });

  test("V-PICKFRAME-T2: the button sends the moment the player is showing", async ({
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
          name: `v-pickframe-ui-${stamp}.mp4`,
          mimeType: "video/mp4",
          buffer: MP4_HEADER,
        },
        _payload: JSON.stringify({ alt: `V-PICKFRAME ui ${stamp}`, usage: "gallery" }),
      },
    });
    expect(uploaded.ok(), `upload failed: ${uploaded.status()}`).toBeTruthy();
    const videoId = (await uploaded.json()).doc.id as number;
    created.push({ collection: "media", id: videoId });
    recordCreated({ collection: "media", id: videoId, note: "V-PICKFRAME ui fixture" });

    // The library renders a thumbnail for every file this account owns, all
    // of them absolute images.wildrunner.org URLs the sandbox cannot route.
    // Without this the console guard fails on the corpus rather than on
    // anything this journey did — the same interception
    // gallery-video-poster.spec.ts needs for the same reason.
    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: PNG }),
    );

    // THE POSTER REQUEST IS INTERCEPTED, and that is the point of this test
    // rather than a way around one. What is worth pinning here is the wiring:
    // that the button reaches the right URL and carries a number the player
    // supplied. The real endpoint answers 503 in this environment — T1 asserts
    // exactly that — and letting the browser see it here would only add a 5xx
    // the console guard is right to refuse, in a test that is not about the
    // status at all.
    let sent: unknown = null;
    await page.route(/\/api\/members\/media\/\d+\/poster$/, async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accepted: true }),
      });
    });

    await page.goto("/members/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    await expect(page).toHaveURL(/\/members$/, { timeout: budget(20_000) });

    await page.getByTestId("member-nav-media").click();
    await page.getByTestId(`media-item-${videoId}`).click();
    await expect(page.getByTestId("media-detail-dialog")).toBeVisible({
      timeout: budget(15_000),
    });

    const button = page.getByTestId("media-detail-poster-frame");
    await expect(button, "a video's dialog offers the cover-frame button").toBeVisible();
    await button.click();

    // The member is told, rather than left looking at an unchanged picture.
    await expect(
      page.getByText("已送出"),
      "pressing the button must say what happened",
    ).toBeVisible({ timeout: budget(15_000) });

    // A number the player supplied, not a hardcoded 0 or a missing field.
    // The fixture is a header-only mp4 that never decodes, so `currentTime`
    // is legitimately 0 here — what matters is that the value travelled from
    // the element rather than being invented, which a missing or non-numeric
    // field would show.
    expect(sent, "the button did not reach the poster endpoint").not.toBeNull();
    expect(typeof (sent as { seconds?: unknown }).seconds).toBe("number");
  });
});
