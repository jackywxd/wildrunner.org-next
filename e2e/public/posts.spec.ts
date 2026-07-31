import { test, expect } from "@playwright/test";
import { ensureAdminUser, TEST_ADMIN } from "../helpers/auth";
import { lexicalParagraph } from "@/lib/lexical-helpers";

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

  test("P2-T8: /og returns an image", async ({ request }) => {
    const response = await request.get("/og?title=test");
    expect(response.ok()).toBeTruthy();
    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/image\//);
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
