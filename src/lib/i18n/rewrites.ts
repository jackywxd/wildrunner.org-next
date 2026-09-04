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
