import { test, expect } from "../helpers/test";
import { ensureAdminUser, TEST_ADMIN } from "../helpers/auth";
import { lexicalParagraph } from "@/lib/lexical-helpers";

import { BASE_URL } from "../../playwright.config";

/** Same test as e2e/public/cache-headers.spec.ts uses to gate deploy-only assertions. */
const IS_LOCAL_TARGET = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(
  BASE_URL,
);

/**
 * Fields that exist only on a `users` document. `posts.owner` and
 * `authors.owner` are both relationships to `users`, so a public query at
 * depth >= 2 populates the whole account record — and Next's dev-mode
 * server-IO instrumentation writes raw `find()` results into the RSC flight
 * stream, which lands them in the page HTML. Grepping the markup for these
 * is the assertion that the public queries never fetch them in the first
 * place.
 *
 * The password is never in the document at any depth (Payload strips it), so
 * it is deliberately not on this list — asserting on it would pass whether or
 * not the leak exists.
 */
const USER_ONLY_FIELDS = [
  "invitePending",
  "invitedAt",
  "invitedBy",
  "storageQuotaMb",
];

test.describe("P2 public posts from Payload", () => {
  test("P2-T1/T3: published post visible, draft hidden", async ({
    request,
    page,
  }) => {
    await ensureAdminUser(request);
    const slug = `p2-public-${Date.now()}`;
    const title = "P2 Published Title";
    const bodyText = "P2 published body visible on site";

    const create = await request.post("/api/posts", {
      data: {
        title,
        slug,
        description: "P2 description",
        content: lexicalParagraph(bodyText),
        _status: "draft",
      },
    });
    expect(create.ok()).toBeTruthy();
    const created = await create.json();
    const id = created.doc?.id ?? created.id;

    await page.goto(`/posts/${slug}`);
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);

    await request.patch(`/api/posts/${id}`, {
      data: {
        _status: "published",
        publishedAt: new Date().toISOString(),
      },
    });

    // Pages ship `cache-control: public, max-age=3600`, so re-visiting the
    // exact same URL serves the browser's own cached copy — the pre-publish
    // 404 — and the revalidation this asserts would be invisible. A unique
    // query makes it a distinct cache entry; the server ignores it.
    await page.goto(`/posts/${slug}?after-publish=${Date.now()}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText(bodyText)).toBeVisible();
    await expect(page.locator("body")).not.toContainText('"type":"root"');
  });

  test("P2-T12: no account PII in public post markup", async ({
    request,
    page,
  }) => {
    await ensureAdminUser(request);
    const slug = `p2-pii-${Date.now()}`;

    // Created by the admin, so the post carries an `owner` and Payload's
    // default byline fills `author` from that same account — both of the
    // relationship hops that used to reach `users`.
    const create = await request.post("/api/posts", {
      data: {
        title: "P2 PII Probe",
        slug,
        description: "P2 PII probe description",
        content: lexicalParagraph("P2 PII probe body"),
        _status: "published",
        publishedAt: new Date().toISOString(),
      },
    });
    expect(create.ok()).toBeTruthy();

    for (const url of [
      `/posts?pii=${Date.now()}`,
      `/posts/${slug}?pii=${Date.now()}`,
    ]) {
      await page.goto(url);
      const html = await page.content();

      expect(html, `${url} leaks the account email`).not.toContain(
        TEST_ADMIN.email,
      );
      for (const field of USER_ONLY_FIELDS) {
        expect(html, `${url} leaks users.${field}`).not.toContain(field);
      }
      // Quoted, because "sessions" on its own is too common a word to assert
      // on raw markup; the leak always arrives as a serialised JSON key.
      expect(html, `${url} leaks the session list`).not.toMatch(
        /\\?"sessions\\?"/,
      );
    }
  });

  /**
   * Deployed origins only, and that gate is the point of the test.
   *
   * `ImageResponse` rasterises through two different pipelines depending on
   * where it runs. The documented one is Satori + Resvg, and that is what the
   * Worker uses: workerd has no native modules, so `@vercel/og`'s
   * `import("sharp")` fails and it falls back to the Resvg WASM build. Under
   * `next dev` that import succeeds, so it takes a `sharp` fast path instead —
   * and Payload processes uploaded images with the *same* `sharp` in the *same*
   * Node process. Once the media specs have run, that shared instance can no
   * longer rasterise Satori's SVG and `/og` answers 500.
   *
   * Reproduced deliberately: `/og` returns 200 before `e2e/media/` runs and 500
   * immediately afterwards on the same server, while
   * `curl https://wildrunner.org/og?title=test` returned a valid 1920x1080 PNG
   * throughout. Locally this test asserted on a code path that is never
   * deployed and failed for a reason no reader can hit.
   *
   * Same reasoning as `e2e/public/cache-headers.spec.ts`: a test that cannot
   * tell the shipped state from a local artefact is not testing the product.
   * deploy.yml's `verify-staging` runs the suite against staging, so this still
   * gates a release — just not a pull request.
   */
  test("P2-T8: /og returns an image", async ({ request }) => {
    test.skip(
      IS_LOCAL_TARGET,
      "next dev renders /og through sharp, which the Worker never uses; only a deployed origin exercises the shipped Resvg path",
    );
    const response = await request.get("/og?title=test");
    expect(response.ok()).toBeTruthy();
    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/image\//);
  });
});

test.describe("P2 missing content answers a real 404", () => {
  // Guards the soft-404 regression: these routes used to answer 200 with the
  // not-found page in the body, so crawlers indexed them as real pages. The
  // cause was `I18nProvider` gating children behind a `useState`/`useEffect`
  // flag — effects don't run during SSR, so the server rendered an empty body
  // and `notFound()` never threw before Next committed the status. Asserting
  // on the status (not the body) is the whole point: the body was always right.
  for (const path of [
    "/posts/definitely-not-a-post",
    "/gallery/definitely-not-a-gallery",
  ]) {
    test(`P2-T10: ${path} responds 404`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    });
  }

  test("P2-T11: pages are server-rendered, not blank until hydration", async ({
    request,
  }) => {
    // The same gate meant every route shipped an empty <body>. Fetching over
    // `request` (no JS) is what makes this meaningful — a browser would run
    // the client render and hide the regression.
    const response = await request.get("/");
    expect(response.ok()).toBeTruthy();
    const html = await response.text();
    const body = /<body[^>]*>([\s\S]*?)<\/body>/.exec(html)?.[1] ?? "";
    const markup = body
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<template[\s\S]*?<\/template>/g, "");
    expect(markup).toContain("Latest Posts");
  });
});

test.describe("P2 home and about", () => {
  test("P2-T4/T6: home and about render", async ({ page }) => {
    const home = await page.goto("/");
    expect(home?.ok()).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();

    const about = await page.goto("/about");
    expect(about?.ok()).toBeTruthy();
    await expect(page.getByText("About", { exact: true }).first()).toBeVisible();
  });

  test("P2-T9: mobile viewport has no page errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/gallery");
    expect(errors).toEqual([]);
  });
});
