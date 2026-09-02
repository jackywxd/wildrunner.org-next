import { expect, test } from "../helpers/test";
import { TEST_ADMIN } from "../helpers/auth";
import { budget } from "../helpers/budget";
import { adminContext, anonContext } from "../helpers/members";
import { recordCreated } from "../helpers/created";
import { deleteCreatedRows } from "../helpers/teardown";

/**
 * D — the deployed level: does this deployment actually work?
 *
 * WHY THIS FILE EXISTS. `docs/testing-strategy.md` §4 has always described a
 * `deployed` level, and until now **no spec belonged to it** — the level had
 * zero members, and `deploy.yml` filled the gap by pointing the entire journey
 * suite at the deployed staging Worker instead. Same 59 tests as the PR gate,
 * same code, different base URL.
 *
 * That did not work, and the run history says so rather than an opinion:
 *
 *   e2e.yml   (PR gate, local D1)    29 runs   79% passed first time
 *   verify-staging (deployed)        25 runs   ~40% passed first time
 *
 * `production` is `needs: verify-staging`, so a gate failing more often than
 * passing was blocking release more than half the time. And of the six of
 * those failures read line by line, not one was a product defect: ECONNRESET,
 * a teardown race, a fixture assumption, a cold-start 500. A gate that cannot
 * catch a real bug but stops the release half the time trains people to re-run
 * it, which is the opposite of a gate.
 *
 * WHAT CHANGED. The full suite stays where it belongs — the PR gate, against a
 * database built and thrown away inside the job. This file is what runs after
 * a deploy, and it asks only the question the PR gate genuinely cannot answer:
 * **is the thing we just deployed wired up and alive?**
 *
 * The PR gate runs `next dev` against emulated local D1 and an empty local R2.
 * So it never exercises the OpenNext production bundle, remote D1 with its
 * migrations applied, the R2 binding, or Payload's CSRF against the deployed
 * `serverURL`. Those six things are this file. Everything else about how the
 * app behaves was already proven before merge.
 *
 * WHAT THIS DELIBERATELY GIVES UP. Depth. If a journey breaks only against a
 * real Worker, this will not catch it — the PR gate has to, or nothing does.
 * That is a real trade and it is the point: the previous arrangement did not
 * catch those either, it just failed for unrelated reasons while claiming to.
 *
 * Read-only except D-SMOKE-T6, which uploads one 1x1 PNG and deletes it. That
 * is the only way to prove the R2 write path from outside, and one fixture per
 * deploy is a different thing from the ~40 the full suite created on a shared
 * database every time.
 */

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const open = (page: import("@playwright/test").Page, path: string) =>
  page.goto(path, { waitUntil: "domcontentloaded" });

test.describe("D the deployment is alive and wired up", () => {
  test("D-SMOKE-T1: the built app serves its own chrome", async ({ page }) => {
    // The OpenNext bundle, not `next dev`. Everything else here depends on
    // this being true, so it fails first and says so plainly.
    const response = await open(page, "/");
    expect(response?.status(), "the home page did not answer 200").toBe(200);
    await expect(page.locator("header").first()).toBeVisible();
  });

  test("D-SMOKE-T2: a page that reads the database renders content", async ({
    page,
  }) => {
    // Remote D1, through the production bundle, with migrations applied. A
    // Worker whose binding is missing or whose schema is behind answers 500
    // here — which is exactly the failure a deploy check exists to catch, and
    // exactly what a static home page cannot see. See AGENTS.md: "A health
    // check must touch the database."
    await open(page, "/posts");
    const first = page.locator('a[href^="/posts/"]').first();
    await expect(
      first,
      "no article is listed — the database is empty, unreachable, or behind",
    ).toBeVisible({ timeout: budget(15_000) });
  });

  test("D-SMOKE-T3: the public API answers, and access control is configured", async ({
    baseURL,
  }) => {
    // Not "is Payload's access control correct" — the PR gate owns that. This
    // asks whether *this deployment* applied any at all, which is a config
    // question and therefore a deploy question. An anonymous caller must get a
    // list, and it must not be the whole media table.
    const anon = await anonContext(baseURL);
    try {
      const listed = await anon.get("/api/media?depth=0&limit=5");
      expect(listed.ok(), `anonymous media list: ${listed.status()}`).toBeTruthy();
      const body = (await listed.json()) as { docs?: { usage?: string }[] };
      expect(Array.isArray(body.docs), "no docs array came back").toBeTruthy();
      for (const doc of body.docs ?? []) {
        expect(
          doc.usage,
          "an anonymous caller was served a file that is not photo-wall content",
        ).toBe("gallery");
      }
    } finally {
      await anon.dispose();
    }
  });

  test("D-SMOKE-T4: signing in works against the deployed origin", async ({
    baseURL,
  }) => {
    // The CSRF pairing is a *deployment* property: Payload builds its allowlist
    // from `serverURL`, which is baked in at build time from
    // NEXT_PUBLIC_SITE_URL. If that and PLAYWRIGHT_BASE_URL disagree, every
    // authenticated request authenticates as nobody and the failure says
    // nothing useful. Better to learn it here, in one test, than through
    // fifteen unrelated ones. See docs/payload-testing.md.
    const admin = await adminContext(baseURL);
    try {
      const me = await admin.get("/api/users/me?depth=0");
      expect(me.ok(), `/api/users/me: ${me.status()}`).toBeTruthy();
      const body = (await me.json()) as { user?: { email?: string } };
      expect(
        body.user?.email,
        "signed in, but the deployment does not think anyone is",
      ).toBe(TEST_ADMIN.email);
    } finally {
      await admin.dispose();
    }
  });

  test("D-SMOKE-T5: a signed-in page that queries the database renders", async ({
    page,
  }) => {
    // P0-T6's job, kept: `/` and an unauthenticated `/admin` both render
    // without touching D1, so a deploy once 500'd every dynamic route while
    // smoke stayed green. This signs in through the form a member uses and
    // loads a page that has to query.
    await open(page, "/members/login");
    await page.getByTestId("member-login-email").fill(TEST_ADMIN.email);
    await page.getByTestId("member-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("member-login-submit").click();
    await expect(page).toHaveURL(/\/members$/, { timeout: budget(20_000) });

    // Clicked, not `goto`: the members nav is a soft navigation and that is
    // the path a member takes. docs/testing-incidents.md — the calendar-toggle
    // bug lived entirely in the client router.
    await page.getByTestId("member-nav-media").click();
    // `media-grid` or `media-grid-empty`: both mean the page queried and
    // answered. Requiring content would make this a corpus assertion, which
    // is not what a deploy check is for.
    await expect(
      page.getByTestId("media-grid").or(page.getByTestId("media-grid-empty")),
      "the member media library did not render after signing in",
    ).toBeVisible({ timeout: budget(20_000) });
  });

  test("D-SMOKE-T6: an upload reaches R2 and comes back", async ({
    baseURL,
    request,
  }) => {
    // The one write, and the only way to prove the R2 binding from outside: a
    // row in D1 whose bytes are served back by the Worker. Both halves matter
    // — a media row can exist with nothing behind it, which is what every
    // migrated row on staging looks like, so asserting the row alone would
    // pass on a broken bucket.
    const admin = await adminContext(baseURL);
    let mediaId: number | null = null;
    try {
      const stamp = Date.now();
      const uploaded = await admin.post("/api/media", {
        multipart: {
          file: { name: `smoke-${stamp}.png`, mimeType: "image/png", buffer: PNG },
          _payload: JSON.stringify({ alt: `deploy smoke ${stamp}`, usage: "attachment" }),
        },
      });
      expect(uploaded.ok(), `upload failed: ${uploaded.status()}`).toBeTruthy();

      const doc = (await uploaded.json()).doc as { id: number; filename?: string };
      mediaId = doc.id;
      // Recorded the moment it exists, before the assertions that could fail —
      // an unrecorded row is one cleanup has no right to remove.
      recordCreated({ collection: "media", id: doc.id, note: "deploy smoke upload" });

      expect(doc.filename, "the upload came back with no filename").toBeTruthy();
      // Through Payload's own file route rather than `doc.url`, and that
      // matters for a check that has to hold in both places. `publicMediaUrl`
      // builds `doc.url` from `R2_PUBLIC_URL`, which is the images.wildrunner.org
      // CDN on a laptop and unset on a CI runner — so `doc.url` is a host this
      // job may not reach, or a bare path that is not a route at all. This
      // route is served by the Worker under test out of the bucket bound to
      // it, which is the thing being proven.
      const bytes = await admin.get(`/api/media/file/${doc.filename}`);
      expect(
        bytes.ok(),
        `the bucket did not serve the object back: ${bytes.status()} ${doc.filename}`,
      ).toBeTruthy();
    } finally {
      if (mediaId !== null) {
        await deleteCreatedRows(request, [{ collection: "media", id: mediaId }]);
      }
      await admin.dispose();
    }
  });
});
