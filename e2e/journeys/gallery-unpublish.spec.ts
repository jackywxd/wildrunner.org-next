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
 */
import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { recordCreated } from "../helpers/created";

test.describe("V-UNPUBLISH a withdrawn photo leaves the wall", () => {
  /** Deleted by the id captured at upload, never by a name or a pattern. */
  let createdMediaId: number | null = null;

  test.afterEach(async ({ request }) => {
    if (!createdMediaId) return;
    const id = createdMediaId;
    createdMediaId = null;

    await request.post("/api/users/login", {
      data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    });
    const deleted = await request.delete(`/api/media/${id}`);
    if (!deleted.ok() && deleted.status() !== 404) {
      throw new Error(
        `teardown failed to delete media/${id}: ${deleted.status()}`,
      );
    }
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
