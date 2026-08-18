/**
 * The photo treatment's source for `/og`, re-encoded to a format satori can
 * decode.
 *
 * **satori does not decode WebP, and says nothing when it declines to.**
 * `next/og` sniffs the fetched bytes and checks them against a list of five
 * types — `[png, apng, jpeg, gif, svg+xml]` — throwing
 * `Unsupported image type: image/webp` for anything else. That throw is
 * swallowed one frame up: the loader ends in
 * `.catch(e => (console.error("Can't load image " + e.message), []))`, so the
 * `<img>` resolves to nothing and the card renders without it. Measured in
 * `node_modules/next/dist/compiled/@vercel/og/index.edge.js` (`us`, `vt`),
 * 2026-08-18. That is why this failed as a bare dark card rather than as an
 * error: there was no failure to see, only an absence.
 *
 * It matters because essentially all our media is WebP — 524 of 548 rows in
 * staging's `media` — so the photo path had never once run on a real cover.
 *
 * Cloudflare's image resizing is enabled on this zone and answers with a real
 * JPEG (verified against `images.wildrunner.org`: 1920x1080 progressive
 * JPEG), which costs no stored rendition and no build step. It is
 * **same-zone only** — resizing an off-zone source through
 * `wildrunner.org/cdn-cgi/image/` returns 403 — so hosts we do not own are
 * passed through untouched, which is exactly what they got before. Production
 * serves media from `images.wildrunner.org` and is covered; staging uploads
 * land on a `*.r2.dev` bucket that sits on no zone of ours.
 *
 * The dimensions match the card canvas, so Cloudflare does the crop that
 * `objectFit: "cover"` would otherwise do on a full-size decode.
 */

/** Our own Cloudflare zone — the only place `/cdn-cgi/image/` will serve us. */
const OWN_ZONE = /(^|\.)wildrunner\.org$/i;

export function resolveBackgroundImage(imageParam: string | null): string | null {
  if (!imageParam) return null;
  try {
    const imageUrl = decodeURIComponent(imageParam);
    if (!/^https?:\/\//i.test(imageUrl)) return null;
    const { hostname, origin, pathname } = new URL(imageUrl);
    // ImageResponse fetches remote URLs; avoid inlining large R2 assets as base64.
    if (!OWN_ZONE.test(hostname)) return imageUrl;
    // Already a rendition — prefixing twice yields a 404 from the resizer.
    if (pathname.startsWith("/cdn-cgi/")) return imageUrl;
    return (
      `${origin}/cdn-cgi/image/format=jpeg,width=1920,height=1080,` +
      `fit=cover,quality=85/${imageUrl}`
    );
  } catch {
    return null;
  }
}
