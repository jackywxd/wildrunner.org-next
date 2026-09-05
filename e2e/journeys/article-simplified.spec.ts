import { expect, test } from "../helpers/test";
import { budget } from "../helpers/budget";

/**
 * V-ZHPOST — a reader on the Simplified site reads an article in Simplified.
 *
 * WHY A BROWSER TEST WHEN THE CONVERSION IS A PURE FUNCTION WITH UNIT TESTS.
 * `U-ZHPOST` proves the transform; it says nothing about whether the article
 * page calls it. That seam is a required parameter on `getPostBySlugParam`,
 * so a page that forgets does not compile — but a page that passes the wrong
 * locale compiles fine, and every assertion about the page's *chrome* would
 * still pass because the chrome comes from the dictionary. The article would
 * simply be in the wrong script, under correct Simplified furniture.
 *
 * IT READS RENDERED TEXT, NEVER THE SERVED HTML. `docs/testing-incidents.md`
 * records grepping served HTML for Chinese and matching the inlined
 * translation bundle rather than anything on screen. `textContent` of the
 * heading and the body cannot make that mistake.
 *
 * AND IT CHECKS THE TRADITIONAL PAGE TOO, in the same run. An assertion that
 * only ever looked at `/zh-hans/` would pass just as well against a site that
 * had converted *every* page, which is the opposite bug and equally wrong.
 */

/**
 * Characters that exist only in Traditional, chosen because the seeded corpus
 * actually contains them — 馬 and 營 are in the site's own name, 時 and 賽 are
 * in most race reports. Their Simplified forms are 马 营 时 赛.
 */
const TRADITIONAL_ONLY = ["馬", "營", "時", "賽", "轉", "個"];

test.describe("V-ZHPOST an article read in Simplified", () => {
  test("V-ZHPOST-1: the article converts and the Traditional one is untouched", async ({
    page,
    request,
  }) => {
    // Two article renders plus the index that finds one; the same dev-server
    // cost V-TIMELINE and V-SHARE measure elsewhere in this suite.
    test.setTimeout(budget(45_000));

    const listed = await request.get(
      "/api/posts?limit=50&depth=0&where[_status][equals]=published&select[slug]=true",
    );
    expect(listed.status(), "the posts API did not answer").toBe(200);
    const slugs = ((await listed.json()) as { docs?: { slug: string }[] }).docs ?? [];
    expect(slugs.length, "no published posts — the corpus is empty").toBeGreaterThan(0);

    // The corpus holds articles written in Simplified as well as Traditional
    // (`royal-victoria-marathon` is one), and those convert to themselves. A
    // test that drew one of them would pass without the conversion running at
    // all, so it looks for an article that is actually in Traditional and
    // says so if there is none.
    let subject: { path: string; traditional: string } | null = null;
    for (const { slug } of slugs) {
      const param = slug.replace(/^posts\//, "");
      await page.goto(`/posts/${param}`, { waitUntil: "domcontentloaded" });
      const heading = page.locator("h1").first();
      await expect(heading).toBeVisible({ timeout: budget(20_000) });
      const text = (await heading.textContent()) ?? "";
      if (TRADITIONAL_ONLY.some((ch) => text.includes(ch))) {
        subject = { path: param, traditional: text };
        break;
      }
    }
    expect(
      subject,
      `no published article has a Traditional-only character in its title — ` +
        `this test cannot see the conversion either way`,
    ).not.toBeNull();

    const { path, traditional } = subject!;

    // The default-locale page is unchanged: this PR must not have converted
    // the site it is written in.
    const stillTraditional = TRADITIONAL_ONLY.filter((ch) => traditional.includes(ch));
    expect(
      stillTraditional.length,
      `/posts/${path} lost its Traditional characters`,
    ).toBeGreaterThan(0);

    await page.goto(`/zh-hans/posts/${path}`, { waitUntil: "domcontentloaded" });
    const simplified = (await page.locator("h1").first().textContent()) ?? "";

    const leftovers = TRADITIONAL_ONLY.filter((ch) => simplified.includes(ch));
    expect(
      leftovers,
      `/zh-hans/posts/${path} still reads 「${simplified}」`,
    ).toEqual([]);

    // The tab title carries the site name appended to the article's, and both
    // halves have to be in one script — 「芝加哥马拉松｜野馬營」 is what a
    // search result and a chat preview show.
    const title = await page.title();
    expect(
      TRADITIONAL_ONLY.filter((ch) => title.includes(ch)),
      `the tab title is in two scripts: 「${title}」`,
    ).toEqual([]);
  });
});
