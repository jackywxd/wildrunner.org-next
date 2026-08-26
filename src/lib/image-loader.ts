/**
 * Every `next/image` URL on the site, built here instead of by `/_next/image`.
 *
 * `/_next/image` runs the transform inside the Worker, through the Cloudflare
 * Images binding. That binding fails a fraction of any burst, and OpenNext's
 * `handleImageRequest` does not catch it, so the Worker throws and Cloudflare
 * answers 1101 — a 500 to the browser. Measured against staging with
 * `wrangler tail`: 20 exceptions out of 184 concurrent requests, in three
 * flavours (`IMAGES_TRANSFORM_ERROR 9502: Images binding connection error`,
 * `9527: Could not resize the image`, and a bare `Network connection lost.`).
 * `/gallery` asks for ~95 transforms in one page load, so a visitor there
 * reliably gets a few broken images, and whichever browser spec happens to be
 * running when it lands fails on the console-error fixture. It took out
 * V-RACEALBUM-T1 on two consecutive staging deploys, each time hidden by a
 * re-run.
 *
 * The R2 CDN is already a Cloudflare zone with Image Resizing on, so the same
 * transform is available from the URL — no Worker invocation, no binding, and
 * the edge caches the result. Verified: a 1.7 MB original comes back as 49 KB
 * at `width=640`.
 *
 * Everything else is returned untouched, which means served at its original
 * size. That is deliberate rather than lazy:
 *
 *   - `pub-*.r2.dev` (staging's own bucket, and where member uploads land
 *     there) is not a zone and answers 404 to `/cdn-cgi/image/…` — checked,
 *     not assumed.
 *   - `/api/media/file/<name>` is Payload serving the bytes itself, which is
 *     what dev and any origin without `R2_PUBLIC_URL` get.
 *   - `/static/**` is brand SVGs, which have nothing to gain from a resize.
 *
 * None of those are the hundred-image page this exists for.
 */

/**
 * Hosts known to be Cloudflare zones with Image Resizing enabled.
 *
 * A host that is merely *served by* Cloudflare is not enough — the zone has
 * to have the feature on, which is why this is a list of known-good origins
 * rather than a guess from the URL.
 */
const RESIZING_HOSTS = new Set(["images.wildrunner.org"]);

interface ImageLoaderProps {
  src: string;
  width: number;
  quality?: number;
}

export default function cloudflareImageLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  if (!src.startsWith("http://") && !src.startsWith("https://")) return src;

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src;
  }
  if (!RESIZING_HOSTS.has(url.hostname)) return src;

  // `format=auto` rather than a fixed webp/avif: the edge picks from the
  // browser's own Accept header, which is what `images.formats` in
  // next.config.ts was asking `/_next/image` to do.
  const options = `width=${width},quality=${quality ?? 75},format=auto`;

  // url.pathname is already percent-encoded, and must stay that way — media
  // keys contain spaces and parentheses (`IMG_20260725_105655_00_117(1).jpg`).
  return `${url.origin}/cdn-cgi/image/${options}${url.pathname}${url.search}`;
}
