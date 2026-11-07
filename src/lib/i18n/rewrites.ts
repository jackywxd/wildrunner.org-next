/**
 * Every unprefixed public address, pointed at the default language.
 *
 * WHY THIS IS A MODULE AND NOT AN ARRAY LITERAL IN `next.config.ts`. The rule
 * these rewrites have to satisfy is invisible in `next dev` and only shows up
 * once `@opennextjs/cloudflare` serves them — it took staging down once, and
 * the long comment beside `rewrites` in `next.config.ts` records exactly how.
 * `e2e/unit/locale-rewrites.spec.ts` replays the adapter's own matcher over
 * this list; a test that re-declared the segments could not have caught it,
 * because it would have been asserting about its own copy.
 */

import { LOCALES } from "./locales";

/** The ten first segments the site publishes pages under. */
export const LOCALIZED_SEGMENTS = [
  "about",
  "design-preview",
  "gallery",
  "members",
  "og",
  "posts",
  "races",
  "riders",
  "share",
  "wx",
] as const;

export type Rewrite = { source: string; destination: string };

/**
 * The `beforeFiles` list. Each segment appears twice — the index exactly, and
 * everything below it with `:path+` — so that a source only ever matches a
 * path it can capture a parameter from. See `next.config.ts` for why that
 * matters.
 */
export function defaultLocaleRewrites(locale: string): Rewrite[] {
  return [
    { source: "/", destination: `/${locale}` },
    ...LOCALIZED_SEGMENTS.flatMap((segment) => [
      { source: `/${segment}`, destination: `/${locale}/${segment}` },
      {
        source: `/${segment}/:path+`,
        destination: `/${locale}/${segment}/:path+`,
      },
    ]),
  ];
}

/**
 * The route paths a public address is rendered under — what `revalidatePath`
 * has to be given.
 *
 * Next's own reference is explicit: with rewrites, `revalidatePath` takes the
 * **destination**, "the actual route file location, not the source path that
 * appears in the browser's address bar"
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md).
 * The cache entry for `/posts/x` is stored under `/zh-hant/posts/x`, so a
 * `revalidatePath("/posts/x")` writes a tag no cached page carries and busts
 * nothing. Every hook in `revalidate-public.ts` passed the address-bar form.
 *
 * That went unnoticed because nothing under `(public)` was being cached:
 * the layout read `headers()` for the header's member link, which makes every
 * route beneath it dynamic. Taking that read out is what made this matter.
 *
 * Every language, not only the default: `/zh-hans/posts/x` is the same
 * article converted at render time, and it goes stale on the same edit.
 */
export function routePathsFor(path: string): string[] {
  const clean = path === "/" ? "" : path;
  return LOCALES.map(({ segment }) => `/${segment}${clean}`);
}
