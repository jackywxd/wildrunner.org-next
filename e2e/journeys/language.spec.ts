import { expect, test } from "../helpers/test";
import { budget } from "../helpers/budget";
import { LOCALES, localizedPath } from "@/lib/i18n/locales";

/**
 * V-LANG — a reader changes the language of the page they are on.
 *
 * WHY THIS IS A BROWSER TEST when `X-I18N-1` already fetches every route in
 * every language. Because the thing that can break here is the *click*.
 * `X-I18N` proves the addresses answer; it says nothing about whether the
 * switcher's links point at the page the reader is looking at, and getting
 * that wrong is silent — every link would still land on a real page, just the
 * wrong one. `docs/testing-incidents.md` records the same shape: the calendar
 * toggle changed the URL and not the view, and only a test that clicked could
 * see it.
 *
 * It also stays on a *deep* page on purpose. The switcher builds its targets
 * by stripping a language segment off `usePathname()`, so `/` and `/posts`
 * would both pass with a switcher that always went home.
 */

test.describe("V-LANG a reader changes language", () => {
  test("V-LANG-1: the switcher lands on the same page in the chosen language", async ({
    page,
  }) => {
    // Three page loads on the heaviest chrome the site has, and the club rail
    // is measured elsewhere at 4.3s a render — see V-SHARE-T3 for the numbers.
    test.setTimeout(budget(60_000));

    const start = "/riders/timeline";
    await page.goto(start, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("language-switcher").first()).toBeVisible();

    for (const { segment, tag } of LOCALES) {
      await page
        .getByTestId("language-switcher")
        .first()
        .getByTestId(`language-${segment}`)
        .click();

      // The address the reader ends on — not a redirect to it, and not the
      // home page. `localizedPath` is the one place that decides the default
      // language keeps the bare address, so the test asks it rather than
      // spelling the two shapes out and drifting from it.
      await expect(page).toHaveURL(
        new RegExp(`${localizedPath(segment, start)}$`),
        { timeout: budget(20_000) },
      );
      await expect(
        page.locator("html"),
        `switching to ${segment} left the document in another language`,
      ).toHaveAttribute("lang", tag);

      // And the switcher says which of the three you are reading. This is
      // the half a reader who landed on the wrong language needs, and it is
      // `"page"` rather than `"true"` on purpose — `RF-T3` asserts page-wide
      // that nothing carries `aria-current="true"`, which is this site's mark
      // for a selected filter chip.
      await expect(
        page
          .getByTestId("language-switcher")
          .first()
          .locator('[aria-current="page"]'),
        `the switcher does not mark ${segment} as the language being read`,
      ).toHaveAttribute("data-testid", `language-${segment}`);
    }
  });

  test("V-LANG-2: the language survives being clicked through", async ({
    page,
  }) => {
    // Three page loads, and the first is the home page's full chrome.
    test.setTimeout(budget(60_000));

    await page.goto("/zh-hans", { waitUntil: "domcontentloaded" });

    // FIRST, EVERY LINK ON THE PAGE AT ONCE — this is what the bug actually
    // was, and one click can only ever prove one of them. The switcher is
    // excluded because naming the *other* languages is its whole job.
    //
    // The home page is where this can be asserted flatly: an article page
    // links to its own print sheet, which lives outside `[lang]` and is
    // correctly left bare, and a test that allowed for that would be
    // re-implementing `localeHref` and asserting against its own copy.
    const hrefs = await page
      .locator('a[href^="/"]:not([data-testid^="language-"])')
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute("href") ?? ""),
      );
    expect(hrefs.length, "no internal links on the home page at all").toBeGreaterThan(3);
    const bare = hrefs.filter((href) => !/^\/zh-hans(\/|$)/.test(href));
    expect(
      bare,
      `these links on /zh-hans drop the reader's language:\n${bare.join("\n")}`,
    ).toEqual([]);

    // THEN THE CLICK, because an href being right does not mean the click
    // goes there: two wrappers in this app preventDefault and call
    // `router.push` by hand, and one of them pushed the address the caller
    // passed rather than the one it had rendered.
    //
    // The nav's first entry rather than a named one: which pages are in the
    // nav is CMS data (`resolveNavItems` reads `topNavItems`), so naming one
    // would make this fail on an environment where an editor reordered them —
    // a failure about the corpus wearing this test's name.
    await page.getByRole("navigation").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/zh-hans\//, { timeout: budget(20_000) });
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");

    // And a second hop, from an index into an article, because a nav that
    // carries the language while the content links do not is exactly the
    // half-fixed state this is guarding against. Reached by address rather
    // than by another click: the click under test is the article card's, and
    // getting there is setup.
    await page.goto("/zh-hans/posts", { waitUntil: "domcontentloaded" });
    const article = page.locator('a[href^="/zh-hans/posts/"]').first();
    await expect(article, "no articles listed — the corpus is empty").toBeVisible({
      timeout: budget(20_000),
    });
    await article.click();
    await expect(page).toHaveURL(/\/zh-hans\/posts\/.+/, {
      timeout: budget(20_000),
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  });

  test("V-LANG-3: the album card navigates by hand, and still in Simplified", async ({
    page,
  }) => {
    test.setTimeout(budget(45_000));

    // `AlbumCards` reaches `next/link` through the progress-bar wrapper, not
    // through `LocaleLink` — so `U-LINKREACH-1`, which reads imports, cannot
    // see it, and neither can the href assertion above, because that wrapper
    // preventDefaults and pushes an address of its own choosing. This is the
    // one path in the app where only a real click can tell.
    await page.goto("/zh-hans/gallery", { waitUntil: "domcontentloaded" });

    // The wall opens on every photo; the albums are the other tab. That is
    // client state rather than an address, so this click changes nothing
    // about the language — it is how the album cards get on screen at all.
    await page.getByTestId("gallery-view-albums").click();

    const card = page.getByTestId("gallery-album-card").first();
    await expect(card, "no albums on the wall — the corpus is empty").toBeVisible({
      timeout: budget(20_000),
    });
    await card.click();

    await expect(page).toHaveURL(/\/zh-hans\/gallery\/.+/, {
      timeout: budget(20_000),
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  });
});
