import { expect, test } from "../helpers/test";
import { budget } from "../helpers/budget";

/**
 * V-SHARE — the WeChat thumbnail and the Xiaohongshu poster.
 *
 * WHY THIS IS A BROWSER TEST AND NOT A BUILD CHECK. The site this was modelled
 * on verifies the same four rules by scanning its built HTML in `postbuild` —
 * it can, because every page is a file in `dist/`. Every page here is
 * `force-dynamic`, so the build produces no such HTML: that scanner ported
 * across would find nothing to check and report success, which is worse than
 * having none. The rules are therefore asserted against a page that has
 * actually been rendered.
 *
 * WHAT BREAKS IF THESE FAIL — and all of it is silent. WeChat picks the first
 * `<img>` in DOM order whose box is ≥300×300; if that image is lazy it is
 * never fetched and never a candidate, if it carries `srcset` WeChat ignores
 * it, and if it is hidden with `display:none` the pick skips it. In every case
 * the share falls back to some other picture on the page and nobody finds out
 * until they look at a phone.
 */

const open = (page: import("@playwright/test").Page, path: string) =>
  page.goto(path, { waitUntil: "domcontentloaded" });

/** The first image WeChat would consider: first in DOM order, at least 300×300. */
async function firstBigImage(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")];
    const big = imgs.find((img) => {
      const w = img.width || Number(img.getAttribute("width")) || 0;
      const h = img.height || Number(img.getAttribute("height")) || 0;
      return w >= 300 && h >= 300;
    });
    if (!big) return null;
    return {
      src: big.getAttribute("src"),
      loading: big.getAttribute("loading"),
      srcset: big.getAttribute("srcset"),
      inPicture: big.parentElement?.tagName === "PICTURE",
      display: getComputedStyle(big).display,
      visibility: getComputedStyle(big).visibility,
      width: big.getBoundingClientRect().width,
      height: big.getBoundingClientRect().height,
    };
  });
}

test.describe("V-SHARE 微信與小紅書", () => {
  test("V-SHARE-T1: the picture WeChat would pick is ours, and obeys all four rules", async ({
    page,
  }) => {
    await open(page, "/posts");
    const first = page.locator('a[href^="/posts/"]').first();
    await expect(
      first,
      "nothing published — the corpus is empty, not the page",
    ).toBeVisible();
    await first.click();
    await expect(page.locator("article > h1")).toBeVisible({ timeout: budget(15_000) });

    // RELOADED BEFORE MEASURING, and that is not a workaround — it is the
    // only state WeChat ever sees. `PageTransitionEffect` wraps every page in
    // `AnimatePresence mode="popLayout"`, so during a soft navigation the
    // *outgoing* page is still mounted: measured mid-transition, the first ten
    // images on this page belonged to the `/posts` index that was on its way
    // out, and the thumbnail came eleventh. WeChat opens a URL cold. The click
    // above is what proves the page is reachable; the reload is what puts the
    // DOM into the shape the rule is about.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("article > h1")).toBeVisible({ timeout: budget(15_000) });

    const candidate = await firstBigImage(page);
    expect(candidate, "no image on the page is large enough for WeChat to pick").not.toBeNull();

    // The whole list in the message, because "some other picture won" is the
    // failure, and which one it was is the entire diagnosis.
    const all = await page.evaluate(() =>
      [...document.querySelectorAll("img")].map(
        (img) => `${img.getAttribute("src")?.slice(0, 60)} ${img.width}x${img.height}`,
      ),
    );

    // 1. It is ours.
    expect(candidate?.src, `WeChat would pick something else on ${page.url()}. Images:\n${all.join("\n")}`).toMatch(
      /^\/wx\/post\//,
    );
    // 2. Not lazy — an off-screen lazy image is never fetched, which is the
    //    most common way this trick fails.
    expect(candidate?.loading).not.toBe("lazy");
    // 3. No srcset and no <picture>: WeChat reads `src` and nothing else.
    expect(candidate?.srcset).toBeNull();
    expect(candidate?.inPicture).toBe(false);
    // 4. Laid out, not hidden. `display:none` or `visibility:hidden` removes
    //    it from the pick even though it is still in the DOM.
    expect(candidate?.display).not.toBe("none");
    expect(candidate?.visibility).not.toBe("hidden");
    expect(candidate?.width).toBeGreaterThanOrEqual(300);
    expect(candidate?.height).toBeGreaterThanOrEqual(300);
  });

  test("V-SHARE-T2: both posters render, and the panel only fetches one when opened", async ({
    page,
  }, testInfo) => {
    await open(page, "/posts");
    const first = page.locator('a[href^="/posts/"]').first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page.getByTestId("share-open")).toBeVisible({ timeout: budget(15_000) });

    // Before the panel is opened the poster has no `src` at all, so the page
    // costs nothing for a reader who never shares. It cannot be `loading=lazy`
    // instead: an image inside a closed <dialog> is display:none, and a lazy
    // image that is never displayed is never fetched.
    const poster = page.getByTestId("share-poster");
    expect(await poster.getAttribute("src")).toBeNull();

    await page.getByTestId("share-open").click();
    await expect(page.getByTestId("share-sheet")).toBeVisible();
    await expect
      .poll(() => poster.getAttribute("src"), { timeout: budget(10_000) })
      .toMatch(/^\/share\/post\//);

    // Both endpoints actually render an image — satori fails silently, so a
    // 200 with a body is the only proof.
    for (const path of [
      await poster.getAttribute("src"),
      (await firstBigImage(page))?.src,
    ]) {
      const response = await page.request.get(path as string);
      expect(response.status(), `${path} did not render`).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/");
      const body = await response.body();
      expect(body.byteLength, `${path} is empty`).toBeGreaterThan(1000);
      // Attached rather than only measured. satori fails *silently* — a card
      // whose text did not lay out still comes back as a valid, non-empty PNG.
      // Bytes prove it rendered something; only looking proves it rendered
      // this. The attachment is how a person checks that without a dev server.
      await testInfo.attach(`poster${(path as string).replace(/\//g, "-")}.png`, {
        body,
        contentType: "image/png",
      });
    }
  });

  test("V-SHARE-T3: a race edition carries the same two things", async ({ page }, testInfo) => {
    /**
     * Four server renders and a satori card do not fit in 20s.
     *
     * Measured with every route already warmed the way `warmup.ts` warms
     * them, so this is the steady-state cost and not a first compile:
     *
     *   /riders/timeline                4341ms   ← the club rail, the
     *   /races/<key>/<year>              552ms     expensive one
     *   /races/<key>/<year>              487ms   ← the reload below
     *   /wx/race/<key>/<year>           2414ms   ← satori, warm
     *
     * Roughly 7.8s of server time before the browser renders anything, and
     * the rail it starts on is the longest page the site has. On CI this
     * timed out twice, the second time inside the card fetch on line 168 —
     * far enough in that the `/wx` warmup entry added for it was working and
     * the budget was simply the wrong size.
     *
     * The assertions are untouched. T1 and T2 above do the same shape on a
     * post rather than a race and pass inside the default, so only this one
     * declares its own.
     */
    test.setTimeout(budget(60_000));

    // Through 穿越時光, which is where an edition page is actually linked from:
    // /races lists the schedule and links out to each organiser, not inward to
    // our own edition pages. The first version of this test looked there and
    // found nothing to click.
    await open(page, "/riders/timeline");
    const race = page.locator('a[href^="/races/"]').first();
    await expect(race, "no race row on the club rail to open").toBeVisible();
    await race.click();
    await expect(page.getByTestId("race-edition-page")).toBeVisible({
      timeout: budget(15_000),
    });

    // Cold, for the reason V-SHARE-T1 gives at length.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("race-edition-page")).toBeVisible({ timeout: budget(15_000) });

    const candidate = await firstBigImage(page);
    expect(candidate?.src, "the race page's own photo wall outranked the thumbnail").toMatch(
      /^\/wx\/race\//,
    );

    const response = await page.request.get(candidate?.src as string);
    expect(response.status()).toBe(200);
    // Attached for the same reason T2 attaches its two: this is the badge
    // layout, and satori draws a perfectly valid PNG whether or not the badge
    // and the lockup actually laid out.
    await testInfo.attach("wx-race.png", {
      body: await response.body(),
      contentType: "image/png",
    });
  });
});
