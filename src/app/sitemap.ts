import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import { LOCALES, localizedPath } from "@/lib/i18n/locales";
import {
  getPublishedGalleries,
  getPublishedPostSlugs,
  getRiderSlugs,
} from "@/lib/content";

/**
 * `/sitemap.xml` — every page, in every language it exists in.
 *
 * WHY IT ARRIVES WITH THE SECOND LANGUAGE and not before. With one language
 * this file would have been a list a crawler builds for itself by following
 * links. With two it is the only thing that says the two are the *same page*
 * rather than two pages: `alternates.languages` on each entry carries the
 * same claim the `hreflang` tags make, and Google's own guidance is to make
 * it in both places or the pairing is one-sided.
 *
 * IT LIVES AT THE APP ROOT, outside `[lang]`, on purpose. There is one
 * sitemap for the site, not one per language — a per-language sitemap would
 * have to cross-reference the others anyway, and `/sitemap.xml` is the
 * address a crawler looks for. Being outside `[lang]` also means it cannot
 * read the current locale, which is right: it enumerates all of them.
 *
 * THE DEFAULT LANGUAGE KEEPS THE BARE ADDRESS — `localizedPath` decides that
 * once for the whole site, so the URLs listed here are the ones already
 * printed into share cards and PDFs rather than a second set beside them.
 *
 * `lastModified` is deliberately absent. The honest source would be each
 * document's `updatedAt`, and the queries this uses do not select it; a date
 * invented here — today's, or the deploy's — tells a crawler every page
 * changed every time the site was built, which is worse than saying nothing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseURL = siteConfig.baseURL.replace(/\/$/, "");

  const [postSlugs, riderSlugs, galleries] = await Promise.all([
    getPublishedPostSlugs(),
    getRiderSlugs(),
    getPublishedGalleries(),
  ]);

  const paths = [
    "/",
    "/posts",
    "/gallery",
    "/races",
    "/riders",
    "/riders/timeline",
    "/about",
    ...postSlugs.map((slug) => `/posts/${slug}`),
    ...riderSlugs.flatMap((slug) => [`/riders/${slug}`, `/riders/${slug}/timeline`]),
    ...galleries.map((gallery) => `/gallery/${gallery.slug}`),
  ];

  return paths.map((path) => ({
    url: `${baseURL}${localizedPath(LOCALES[0].segment, path)}`,
    alternates: {
      languages: Object.fromEntries(
        LOCALES.map(({ segment, tag }) => [
          tag,
          `${baseURL}${localizedPath(segment, path)}`,
        ]),
      ),
    },
  }));
}
