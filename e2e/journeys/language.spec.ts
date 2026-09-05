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
});
