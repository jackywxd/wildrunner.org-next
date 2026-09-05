import { expect, test } from "../helpers/test";
import { budget } from "../helpers/budget";

/**
 * V-ENPOST — an English reader meets an article nobody has translated.
 *
 * WHY THE UNTRANSLATED CASE IS THE ONE WORTH A BROWSER TEST. It is the case
 * every article on the site is in today, and the one with no data behind it
 * to get wrong — which is exactly why it is easy to ship broken. The opposite
 * case, where a translation exists and is used, is decided by pure functions
 * over a document and is covered at the unit level (`U-ENPOST-1`…`5`), where
 * the half-finished states can be constructed directly instead of seeded.
 *
 * IT ALSO ASSERTS THE NOTICE IS ABSENT ELSEWHERE, in the same run. A test
 * that only looked at `/en` would pass just as well against a site that
 * apologised for a missing translation on every page in every language.
 */
test.describe("V-ENPOST an article with no English version", () => {
  test("V-ENPOST-1: /en says so and still shows the article", async ({
    page,
    request,
  }) => {
    test.setTimeout(budget(45_000));

    const listed = await request.get(
      "/api/posts?limit=1&depth=0&where[_status][equals]=published&select[slug]=true",
    );
    expect(listed.status(), "the posts API did not answer").toBe(200);
    const docs = ((await listed.json()) as { docs?: { slug: string }[] }).docs ?? [];
    expect(docs.length, "no published posts — the corpus is empty").toBeGreaterThan(0);
    const path = docs[0].slug.replace(/^posts\//, "");

    await page.goto(`/en/posts/${path}`, { waitUntil: "domcontentloaded" });
    const notice = page.getByTestId("post-untranslated");
    await expect(notice).toBeVisible({ timeout: budget(20_000) });

    // The article is still here. An apology with nothing under it would be a
    // worse answer than the Chinese, and `/en/posts/<slug>` is an address
    // that has been shared and indexed.
    await expect(page.locator("h1").first()).toBeVisible();
    const body = await page.locator(".article-body").first().textContent();
    expect((body ?? "").length, "the notice replaced the article").toBeGreaterThan(50);

    // And nobody else apologises.
    for (const other of [`/posts/${path}`, `/zh-hans/posts/${path}`]) {
      await page.goto(other, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(
        page.getByTestId("post-untranslated"),
        `${other} claims it has no translation`,
      ).toHaveCount(0);
    }
  });
});
