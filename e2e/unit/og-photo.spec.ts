/**
 * U-OGP — the `/og` photo treatment's source URL.
 *
 * The failure this protects against: **a WebP cover reaches satori
 * untransformed, and the share card silently loses its photograph.** satori
 * decodes five types and WebP is not one of them; the loader catches its own
 * `Unsupported image type` and resolves the `<img>` to nothing, so the card
 * comes back 200 with a bare dark ground where the picture should be. No
 * error, no fallback — which is why it survived in production unnoticed, and
 * why nothing that only checks the response status can see it.
 *
 * Pure string work, so this is the cheapest level that can observe it — no
 * browser, no network, no rasteriser. What it deliberately does not assert is
 * that the rendered PNG *contains* a photograph; that was checked by
 * rendering the card and looking at it, and re-checking it here would mean
 * decoding a 1920x1080 PNG to prove a URL was built correctly.
 *
 * `@playwright/test` rather than `../helpers/test`: nothing here touches
 * `page`, and the console-guard fixture in that helper depends on it, so
 * importing it would launch a browser for nothing.
 */
import { expect, test } from "@playwright/test";

import { resolveBackgroundImage } from "@/lib/ogPhoto";

const WEBP = "https://images.wildrunner.org/posts/2024/a/cover.webp";

test("U-OGP-T1 a WebP on our zone is asked for as JPEG", () => {
  const resolved = resolveBackgroundImage(WEBP);

  expect(resolved).toBe(
    "https://images.wildrunner.org/cdn-cgi/image/format=jpeg," +
      `width=1920,height=1080,fit=cover,quality=85/${WEBP}`,
  );
});

test("U-OGP-T2 an encoded param survives the round trip", () => {
  // buildVideoOgImageUrl puts the source through URLSearchParams, so what
  // arrives is percent-encoded; decoding it is the first thing that happens.
  expect(resolveBackgroundImage(encodeURIComponent(WEBP))).toContain(
    `/cdn-cgi/image/format=jpeg,width=1920,height=1080,fit=cover,quality=85/${WEBP}`,
  );
});

test("U-OGP-T3 an off-zone host is passed through untouched", () => {
  // Cloudflare answers 403 for a source outside the zone, so rewriting a
  // *.r2.dev url (staging's upload bucket) would turn a picture that at least
  // sometimes decodes into one that never loads at all.
  const offZone = "https://pub-f82e5464c241415f9ea3f879e8f46e7f.r2.dev/x.jpg";

  expect(resolveBackgroundImage(offZone)).toBe(offZone);
});

test("U-OGP-T4 an already-resized url is not prefixed twice", () => {
  // Measured: a doubly-prefixed url returns 404 from the resizer, which lands
  // back in satori's silent catch — the exact failure being fixed.
  const resized =
    "https://images.wildrunner.org/cdn-cgi/image/format=jpeg,width=1920/" +
    WEBP;

  expect(resolveBackgroundImage(resized)).toBe(resized);
});

test("U-OGP-T5 anything that is not an absolute http url is refused", () => {
  // A relative or `data:` source makes satori throw where the route cannot
  // distinguish it from a real render failure, so it never becomes a photo.
  expect(resolveBackgroundImage(null)).toBeNull();
  expect(resolveBackgroundImage("/local/cover.webp")).toBeNull();
  expect(resolveBackgroundImage("javascript:alert(1)")).toBeNull();
});
