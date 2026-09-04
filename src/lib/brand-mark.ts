/**
 * The horse mark, inlined as paths rather than fetched as artwork.
 *
 * It used to be `<img src="/static/brand/lockup-horizontal.png">`, and that
 * silently produced *no logo at all* on every card this route has ever
 * served in production. `.gitattributes` tracks `*.png` through Git LFS, and
 * the deployed Worker answers `/static/brand/lockup-horizontal.png` with 130
 * bytes of LFS pointer text under an `image/png` content type — measured on
 * wildrunner.org, 2026-08-18. Satori cannot decode that, so it drew nothing
 * and the failure was invisible: no error, no fallback, just a card with an
 * empty corner.
 *
 * Paths in a data URI have no such failure mode — no network, no asset
 * pipeline, no LFS, and the fill is a parameter so one mark serves both the
 * light and dark treatments. Geometry copied verbatim from
 * public/static/brand/mark-outline.svg.
 */
export function markDataUri(fill: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
    `<g transform="translate(60 62) rotate(-13) scale(0.66) translate(-74 -60)">` +
    `<g fill="${fill}">` +
    `<path d="M10 72 L34 44 L52 26 L54 26 L60 12 L66 25 L69 24 L78 14 L81 31 L84 46 L92 70 L104 108 L56 108 L44 80 L26 80 L16 86 Z"/>` +
    `<path d="M88 32 L126 18 L128 30 L90 44 Z M96 52 L132 40 L134 52 L98 64 Z M104 74 L136 64 L138 76 L106 86 Z"/>` +
    `</g></g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
