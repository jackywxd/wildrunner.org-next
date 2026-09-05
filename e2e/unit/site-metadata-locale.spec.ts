import { expect, test } from "@playwright/test";

import { pageMetadata } from "@/lib/site-metadata";
import { siteConfig } from "@/config/site";

/**
 * U-METALOCALE — a page's metadata is in one script.
 *
 * The tab title and `og:site_name` are the two strings a search result and a
 * chat preview show, and they are assembled from three sources that used to
 * be Traditional by default: the dictionary, an article that has already been
 * converted, and a value written once in code or typed into `/admin`. Mixing
 * them produced 「芝加哥马拉松｜野馬營」 on every Simplified article, and the
 * page is the only place that was visible — nothing in the suite looked at a
 * title.
 */
test.describe("U-METALOCALE metadata in one script", () => {
  test("U-METALOCALE-1: a Simplified page's site name is Simplified", () => {
    const meta = pageMetadata({
      path: "/gallery",
      title: "相册",
      subtitle: "野馬營的照片",
      card: { kind: "plain" },
      locale: "zh-hans",
    });
    expect(meta.openGraph?.siteName).toBe("野马营");
    // The stored subtitle was Traditional; the page it describes is not.
    expect(meta.description).toBe("野马营的照片");
  });

  test("U-METALOCALE-2: the default site is untouched", () => {
    for (const locale of ["zh-hant"]) {
      const meta = pageMetadata({
        path: "/gallery",
        title: "相簿",
        subtitle: "野馬營的照片",
        card: { kind: "plain" },
        locale,
      });
      expect(meta.openGraph?.siteName, locale).toBe(siteConfig.title);
      expect(meta.description, locale).toBe("野馬營的照片");
    }
  });

  test("U-METALOCALE-3: the home page is not its own name twice", () => {
    // `(site)/layout.tsx` appends the site name to every title, so the one
    // page whose subject IS the site opts out with `absolute`. That opt-out
    // is an equality test against `siteConfig.title`, and converting only the
    // left side of it silently produced 「野马营｜野马营」.
    for (const locale of ["zh-hant", "zh-hans"]) {
      const meta = pageMetadata({
        path: "/",
        title: siteConfig.title,
        subtitle: "一群野馬，一個家",
        card: { kind: "plain" },
        locale,
      });
      expect(
        meta.title,
        `the home page in ${locale} did not opt out of the title template`,
      ).toHaveProperty("absolute");
    }
  });

  test("U-METALOCALE-4: a route with no locale renders what is stored", () => {
    // `/print` and the share cards live outside `[lang]` and pass no locale.
    const meta = pageMetadata({
      path: "/print/posts/x",
      title: "芝加哥馬拉松",
      subtitle: "野馬營的照片",
      card: { kind: "plain" },
    });
    expect(meta.openGraph?.title).toBe("芝加哥馬拉松");
    expect(meta.openGraph?.siteName).toBe(siteConfig.title);
  });
});
