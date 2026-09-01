/**
 * V-UNPUBLISH — a photo taken off the photo wall leaves the photo wall.
 *
 * /gallery is cached now. Every other route under it stays force-dynamic, and
 * this one could only change because it has no dynamic segment, so nothing
 * forks a child process to ask it for `generateStaticParams`.
 *
 * Caching a page whose contents a member can withdraw is only safe if
 * withdrawal reaches the cache. `media` had no revalidation hook at all until
 * #103 — unticking 顯示在相片牆 took effect purely because the page was
 * rebuilt on every request — so the ordering was deliberate: publishing may
 * lag, un-publishing may not. This is the assertion that keeps the two halves
 * attached to each other.
 *
 * WHAT IT PROVES WHERE, said plainly. Against `next dev` it cannot fail for
 * the interesting reason: the dev server re-renders regardless, so a broken
 * invalidation channel still looks green here. The environment where this
 * bites is a real build with the R2 incremental cache and the D1 tag cache —
 * that is `verify-staging`, and that is the run whose result counts for this
 * spec. Locally it is a smoke test that the flow still works at all.
 *
 * `usage` is changed through the REST API rather than the member UI on
 * purpose: the member dialog is already covered by V-LIBRARY-T2, and what is
 * being pinned here is the cache, not the checkbox.
 *
 * WHY THE MEDIA FILES ARE INTERCEPTED. The first version of this spec loaded
 * /gallery for real and then immediately PATCHed the same server; CI answered
 * the PATCH with `read ECONNRESET` while the server logged nothing at all — no
 * exception, no SQLITE_BUSY, nothing. It passes locally for a reason that is
 * pure accident: the seeded corpus stores absolute `images.wildrunner.org`
 * URLs, so a local wall loads its ~420 photos from a host that is not the
 * server under test. CI has no `R2_PUBLIC_URL`, so the same rows are
 * `/api/media/file/<name>` — every one of them served by this dev server,
 * through `checkFileAccess` and a D1 query each. This is the only spec that
 * writes to the API immediately after paying that, and it is the only one that
 * failed; M-PRIVATE-T1/T2 create and delete media in the same shard, firing
 * the same revalidation hook, and both pass.
 *
 * Fulfilled rather than aborted: `route.abort()` makes the browser log
 * `Failed to load resource: net::ERR_FAILED`, which is a console.error, which
 * ../helpers/test.ts fails the test on. And it costs the assertions nothing —
 * what is being claimed is which media the wall lists, not that 420 photos
 * decode. The locator matches the `src` attribute, which interception does not
 * touch, so a row served from the wrong URL still fails.
 *
 * Both media hosts are matched, and the second one is what makes this spec
 * verifiable at all. The corpus stores `images.wildrunner.org` URLs, which no
 * sandbox here can reach; without intercepting them a local run drowns in
 * `ERR_TUNNEL_CONNECTION_FAILED` and the console guard reds the test whatever
 * the assertions did — which is exactly why the ECONNRESET above could only be
 * found in CI. One matcher, two environments, and the same claim in both.
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

test.describe("V-UNPUBLISH a withdrawn photo leaves the wall", () => {
  /** Deleted by the id captured at upload, never by a name or a pattern. */
  let createdMediaId: number | null = null;

  test.afterEach(async ({ request }) => {
    if (!createdMediaId) return;
    const id = createdMediaId;
    createdMediaId = null;
    await deleteCreatedRows(request, [{ collection: "media", id }]);
  });

  test("V-UNPUBLISH-T1: on the wall, then off it", async ({ page, request }) => {
    test.setTimeout(budget(60_000));

    const login = await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    expect(login.ok(), "fixture setup could not sign in").toBeTruthy();

    const stamp = Date.now();
    const filename = `v-unpublish-${stamp}.svg`;
    const created = await request.post("/api/media", {
      multipart: {
        file: {
          name: filename,
          mimeType: "image/svg+xml",
          buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#7c3aed"/></svg>',
          ),
        },
        _payload: JSON.stringify({ alt: `V-UNPUBLISH ${stamp}`, usage: "gallery" }),
      },
    });
    expect(created.ok(), `media create failed: ${created.status()}`).toBeTruthy();
    const doc = (await created.json()).doc as { id: number; url: string };
    createdMediaId = doc.id;
    recordCreated({ collection: "media", id: doc.id, note: "V-UNPUBLISH probe" });

    await page.route(/\/api\/media\/file\/|images\.wildrunner\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL }),
    );

    // The photo wall renders by `src`, and the media's own url is the one
    // identifier that survives the mapping into SitePhoto.
    const onWall = page.locator(`img[src*="${filename}"]`).first();

    await page.goto("/gallery", { waitUntil: "domcontentloaded" });
    await expect(onWall, "a fresh gallery upload should be on the wall").toBeVisible({
      timeout: budget(20_000),
    });

    // Withdraw it. The afterChange hook on `media` is what has to turn this
    // into a cache invalidation; without it the next visitor keeps seeing the
    // photo and nothing anywhere reports a problem.
    const withdrawn = await request.patch(`/api/media/${doc.id}`, {
      data: { usage: "private" },
    });
    expect(withdrawn.ok(), `usage update failed: ${withdrawn.status()}`).toBeTruthy();

    await page.goto("/gallery", { waitUntil: "domcontentloaded" });
    await expect(
      onWall,
      "a withdrawn photo must not survive on a cached wall",
    ).toHaveCount(0, { timeout: budget(20_000) });
  });
});
