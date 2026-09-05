import { expect, test } from "@playwright/test";

import { localeHref } from "@/lib/i18n/locale-href";

/**
 * U-LOCALEHREF — an ordinary link stays in the language the reader chose.
 *
 * The bug this is the fix for: `/zh-hans` lasted one click. Every internal
 * link in the app was the unprefixed address, and `next.config.ts` rewrites
 * unprefixed to the default locale — so a Simplified reader who clicked
 * anything landed back in Traditional, and the language switcher was
 * decoration.
 *
 * The risk in fixing it is the opposite one: prefixing something that must
 * not be prefixed. Most of the cases below are that half.
 */
test.describe("U-LOCALEHREF a link keeps its reader's language", () => {
  test("U-LOCALEHREF-1: on a prefixed page, internal links carry the prefix", () => {
    expect(localeHref("/posts", "/zh-hans/gallery")).toBe("/zh-hans/posts");
    expect(localeHref("/posts/2024/utmb", "/zh-hans")).toBe("/zh-hans/posts/2024/utmb");
    // The site root is `/zh-hans`, not `/zh-hans/`.
    expect(localeHref("/", "/zh-hans/posts")).toBe("/zh-hans");
  });

  test("U-LOCALEHREF-2: the default locale is the unprefixed address", () => {
    // `/zh-hant/posts` is not where the Traditional site lives — `/posts` is,
    // and that is the whole point of the rewrite in next.config.ts. Prefixing
    // here would invent a second address for every page.
    expect(localeHref("/posts", "/")).toBe("/posts");
    expect(localeHref("/posts", "/gallery")).toBe("/posts");
    expect(localeHref("/posts", "/zh-hant/gallery")).toBe("/posts");
  });

  test("U-LOCALEHREF-3: trees with no language are left alone", () => {
    // `/admin` is Payload's own, `/print/...` is the keepsake sheet. Neither
    // is under `[lang]`, and a prefix would 404 both.
    for (const from of ["/admin", "/admin/collections/posts", "/print/posts/2024/utmb"]) {
      expect(localeHref("/posts", from), from).toBe("/posts");
      expect(localeHref("/members", from), from).toBe("/members");
    }
  });

  test("U-LOCALEHREF-4: what is not an internal path is not touched", () => {
    const from = "/zh-hans/posts";
    for (const href of [
      "https://strava.com/athletes/1",
      "//cdn.example.com/x.png",
      "mailto:hi@wildrunner.org",
      "tel:+16040000000",
      "#top",
      "?view=calendar",
    ]) {
      expect(localeHref(href, from), href).toBe(href);
    }
  });

  test("U-LOCALEHREF-5: a link that names a language keeps the one it named", () => {
    // The switcher builds these deliberately. Prefixing again would produce
    // `/zh-hans/zh-hant/posts`, which is not a page.
    expect(localeHref("/zh-hant/posts", "/zh-hans/posts")).toBe("/zh-hant/posts");
    expect(localeHref("/zh-hans/posts", "/zh-hans/posts")).toBe("/zh-hans/posts");
  });

  test("U-LOCALEHREF-6: a path that merely starts like one is still its own path", () => {
    // Matching on a prefix rather than a whole segment is the classic way to
    // break this, on either side. `/zh-hansel` is not `/zh-hans`, so a reader
    // there is not reading Simplified; `/postscript` is not `/posts`, so it
    // is not a page this site publishes in two languages.
    expect(localeHref("/posts", "/zh-hansel")).toBe("/posts");
    expect(localeHref("/postscript", "/zh-hans/posts")).toBe("/postscript");
  });

  test("U-LOCALEHREF-7: an address with no copy under `[lang]` keeps the bare one", () => {
    // Both of these are rendered by pages that ARE under `[lang]` — the
    // member shell links to Payload's panel, and an article links to its own
    // print sheet — so the reader is in Simplified and the link is internal
    // and every earlier rule says prefix it. Neither address exists prefixed:
    // `/admin`, `/api` and `/print` are absent from `LOCALIZED_SEGMENTS` on
    // purpose (see `next.config.ts`), which is exactly why that list, and not
    // "does it start with a slash", is what decides this.
    const from = "/zh-hans/posts/2024/utmb";
    expect(localeHref("/admin", from)).toBe("/admin");
    expect(localeHref("/print/posts/2024/utmb", from)).toBe("/print/posts/2024/utmb");
    expect(localeHref("/api/print/posts/2024/utmb", from)).toBe(
      "/api/print/posts/2024/utmb",
    );
  });

  test("U-LOCALEHREF-8: a query or a hash does not hide the segment", () => {
    // The rider and race chips link to `/riders?badge=…`, so the segment has
    // to be read up to the `?` — reading to the next `/` would see
    // `riders?badge=six-majors`, match nothing, and leave every filter chip
    // on the page in the wrong language.
    expect(localeHref("/riders?badge=six-majors", "/zh-hans/riders")).toBe(
      "/zh-hans/riders?badge=six-majors",
    );
    expect(localeHref("/races#calendar", "/zh-hans/races")).toBe(
      "/zh-hans/races#calendar",
    );
  });
});
