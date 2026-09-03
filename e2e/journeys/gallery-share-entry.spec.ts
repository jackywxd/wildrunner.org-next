/**
 * V-SHAREENTRY — the wall can reach a single item's share page.
 *
 * This is a regression test for something that was quietly lost. Before #105,
 * /gallery and every album page rendered `GalleryVideos`, a strip whose every
 * tile carried a share button. #105 replaced that strip with `MediaGrid` — the
 * right change, and one that took the share button with it. The only copy of
 * the strip left is the race page's, so after #110 shipped
 * `/gallery/m/[mediaId]`, that page had almost nothing linking to it: a
 * visitor on the wall could not reach it at all.
 *
 * So what is pinned here is reachability, not markup: open the wall, open an
 * item, and get to its own page from there. Photos are the case that never
 * worked even before #105 — `SitePhoto` carried no media id until this change
 * — so a photo fixture is the one that would fail first if the id stopped
 * being threaded through `mapMediaToPhoto`.
 *
 * Media hosts are intercepted for the reason gallery-unpublish.spec.ts gives:
 * local dev points R2_PUBLIC_URL at images.wildrunner.org, which this sandbox
 * cannot reach, and the console guard fails the test on the resulting
 * ERR_TUNNEL_CONNECTION_FAILED before any assertion runs.
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

test.describe("V-SHAREENTRY the wall can reach an item's share page", () => {
  let mediaId: number | null = null;

  test.afterEach(async ({ request }) => {
    if (mediaId === null) return;
    const id = mediaId;
    mediaId = null;
    await deleteCreatedRows(request, [{ collection: "media", id }]);
  });

  test("V-SHAREENTRY-T1: opening a photo offers a link to its own page", async ({
    page,
    request,
  }) => {
    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    // Newest upload, so it is the wall's first tile — which is the one this
    // test opens. Anything else would depend on corpus order.
    const stamp = Date.now();
    const created = await request.post("/api/media", {
      multipart: {
        file: {
          name: `v-shareentry-${stamp}.svg`,
          mimeType: "image/svg+xml",
          buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#b91c1c"/></svg>',
          ),
        },
        _payload: JSON.stringify({ alt: `V-SHAREENTRY ${stamp}`, usage: "gallery" }),
      },
    });
    expect(created.ok(), `media create failed: ${created.status()}`).toBeTruthy();
    const doc = (await created.json()).doc as { id: number };
    mediaId = doc.id;
    recordCreated({ collection: "media", id: doc.id, note: "V-SHAREENTRY probe" });

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    await page.goto("/gallery", { waitUntil: "domcontentloaded" });
    const grid = page.getByTestId("gallery-all-photos");
    await expect(grid).toBeVisible({ timeout: budget(20_000) });

    // `load`, not just the `domcontentloaded` above: the album's onClick is
    // React's, and a click that lands before hydration is silently dropped —
    // the lightbox then never opens and this fails as "no share button", which
    // says nothing about share buttons. Seen once, running four gallery specs
    // in a row on a busy machine; it passes alone every time, which is exactly
    // what makes the mechanism worth writing down rather than calling it
    // flaky. The same wait is already in P-PHOTO, V-DESC and V-BGM.
    await page.waitForLoadState("load");

    // Click the tile rather than calling the lightbox directly: the claim is
    // that a visitor gets there, and AGENTS.md records that tests which
    // navigate instead of clicking are how the last such gap survived.
    await grid.locator("img").first().click();

    const share = page.getByTestId("gallery-share");
    await expect(share, "an opened item must offer a way to its own page").toBeVisible({
      timeout: budget(15_000),
    });
    // The address is the assertion, not just the button's presence: a share
    // button pointing at the wrong id is worse than none.
    await expect(share).toHaveAttribute("href", `/gallery/m/${doc.id}`);

    // ...and it actually lands, which is what pins the id all the way through
    // mapMediaToPhoto into a route that filters on usage.
    await share.click();
    await expect(page).toHaveURL(new RegExp(`/gallery/m/${doc.id}$`), {
      timeout: budget(20_000),
    });
  });
});
