/**
 * What the two posters are *of*, and the plumbing both share with `/og`.
 *
 * ONE RESOLVER, TWO LAYOUTS. `/wx` (600×600, WeChat's in-app thumbnail) and
 * `/share` (1080×1440, a Xiaohongshu poster) draw the same facts at very
 * different sizes, so the lookup lives here and only the JSX differs.
 *
 * RUNTIME, NOT BUILD TIME, and that is the whole difference from the
 * reference site this was modelled on. jackywu.ca writes 27 × 3 real files
 * during `astro build` because its content is files in the repo. Here a member
 * publishes an article at 9pm and it has to be shareable at 9:01 — there is no
 * build in between. `/og` already answers on request for exactly this reason,
 * and these two follow it rather than introducing a second pipeline.
 */

import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

import { getPostBySlugParam, getRaceEditionDetail } from "@/lib/content";
import { badgeToken } from "@/lib/races/design-tokens";
import { resolveBadgeEvent } from "@/lib/races/badge-source";
import { catalogueMap, getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import { siteConfig } from "@/config/site";
import { resolveBackgroundImage } from "@/lib/ogPhoto";

/**
 * A badge as a poster can draw it.
 *
 * NOT THE `RaceBadge` COMPONENT. That is an SVG React component, and satori —
 * which is what `ImageResponse` renders with — does not rasterise arbitrary
 * SVG children; it lays out a small subset of CSS over `div`, `span` and
 * `img`. Handing it `<RaceBadge/>` produces nothing, silently, which is the
 * worst possible failure for an image endpoint.
 *
 * So the poster redraws the badge's *look* out of divs, from the same
 * `badgeToken(event)` the real badge uses. The colours therefore always agree
 * with the badge on the page — both are `hash(event.key)` — without the
 * poster needing to render SVG at all.
 */
export type PosterBadge = {
  abbr: string;
  primary: string;
  secondary: string;
  ink: string;
  band: string;
};

export type PosterSubject = {
  /** The headline. */
  title: string;
  /** The public byline — an author's name, never an account. */
  byline?: string;
  /** Short facts under the title: place, distances, year. */
  facts: string[];
  /** Drawn for a race (D2: 比賽用徽章). */
  badge?: PosterBadge;
  /** Drawn for an article that has one (D2: 文章用封面照). */
  photo?: string;
};

/**
 * Resolve `/wx/<parts>` or `/share/<parts>` to what it is a poster of.
 *
 * `null` means "no poster", and every caller answers 404 rather than drawing
 * something generic. A poster is a claim about a specific thing; a poster of
 * nothing is worse than no poster.
 *
 * WHAT IS NOT SHAREABLE NEVER GETS HERE. `getPostBySlugParam` already filters
 * to `_status: published`, and `getRaceEditionDetail` reads public reference
 * data. A draft returns null and therefore 404 — the same rule the reference
 * site spells as `shareable: false`, expressed in this site's own fields.
 */
export async function resolvePosterSubject(
  parts: string[],
): Promise<PosterSubject | null> {
  const [kind, ...rest] = parts;

  if (kind === "post" && rest.length > 0) {
    const post = await getPostBySlugParam(rest.join("/"));
    if (!post) return null;
    return {
      title: post.title,
      byline: post.author,
      facts: post.date ? [post.date.slice(0, 10).replace(/-/g, ".")] : [],
      photo: posterPhoto(post.image?.src),
    };
  }

  if (kind === "race" && rest.length === 2) {
    const [key, yearParam] = rest;
    const year = Number(yearParam);
    if (!Number.isInteger(year)) return null;

    const edition = await getRaceEditionDetail(key, year);
    if (!edition) return null;

    const catalogue = catalogueMap(await getRaceCatalogueEvents());
    const token = badgeToken(resolveBadgeEvent(catalogue, key));

    return {
      title: edition.nameZh || edition.name,
      facts: [edition.location, edition.distanceSummary].filter(
        (fact): fact is string => Boolean(fact),
      ),
      badge: {
        abbr: token.abbr,
        primary: token.primary,
        secondary: token.secondary,
        ink: token.ink,
        band: String(edition.year),
      },
    };
  }

  return null;
}

/**
 * The font `/og` uses, fetched the same way.
 *
 * LATIN ONLY, AND THAT IS FINE HERE — verified rather than assumed. The
 * production card for 「威士拿 UTMB 100K 完賽紀錄」 renders its Chinese
 * correctly, because the Worker supplies a CJK fallback face for the glyphs
 * Inter does not carry. That was checked by fetching the live PNG and looking
 * at it, not by reading this comment's ancestor.
 *
 * The cost of relying on it: we do not choose the Chinese typeface, and a
 * runtime change could change it. Shipping a subset CJK font is the fix if it
 * ever matters — the reference site does exactly that — and it is deliberately
 * not done up front for a face that already renders.
 */
export async function loadPosterFont(request: Request): Promise<ArrayBuffer | null> {
  try {
    const fontUrl = new URL("/fonts/Inter-Regular.ttf", request.url);
    const res = await fetch(fontUrl);
    if (!res.ok) return null;
    return res.arrayBuffer();
  } catch {
    return null;
  }
}

export const POSTER_CACHE =
  // The same window `/og` uses. A member who renames an article sees the old
  // poster for up to a day; that is the trade this project already made for
  // share cards, and making the two disagree would be the surprising thing.
  "public, max-age=86400, stale-while-revalidate=604800";

/**
 * Render, buffer, and answer — never stream.
 *
 * `ImageResponse` is a lazily-rendered stream: satori builds an SVG and a
 * rasteriser turns it into PNG *after* the headers are already on the wire, so
 * anything that throws in there produces a reset connection with no status and
 * no body. `/og` learned this the hard way and buffers; these do the same, and
 * for the same reason.
 */
export async function renderPoster(
  element: ReactElement,
  options: { width: number; height: number; font: ArrayBuffer | null },
): Promise<Response> {
  const image = new ImageResponse(element, {
    width: options.width,
    height: options.height,
    headers: { "Cache-Control": POSTER_CACHE },
    fonts: options.font
      ? [{ name: "Inter", data: options.font, style: "normal" as const }]
      : undefined,
  });

  try {
    const body = await image.arrayBuffer();
    return new Response(body, { headers: image.headers });
  } catch (error) {
    const cause = (error as { cause?: unknown })?.cause;
    console.error(
      `poster render failed: ${error instanceof Error ? error.message : String(error)}` +
        `${cause ? ` | cause: ${cause instanceof Error ? cause.message : String(cause)}` : ""}`,
    );
    return new Response("poster unavailable", {
      status: 500,
      headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  }
}

/**
 * A cover the poster can actually draw.
 *
 * TWO THINGS HAVE TO HAPPEN AND NEITHER IS OPTIONAL.
 *
 * `mediaImageSrc` strips our own origin, so a cover arrives as a path — and
 * satori fetches, so a path resolves to nothing. It is made absolute first.
 *
 * Then it goes through `resolveBackgroundImage`, which is where the real trap
 * is: **satori does not decode WebP and says nothing when it declines to** —
 * the loader catches its own error and the `<img>` resolves to empty, so the
 * poster renders correctly *without the picture* and no error is logged
 * anywhere. Essentially all of this site's media is WebP (524 of 548 rows when
 * `ogPhoto.ts` measured it), so the photo path would have failed on every real
 * cover. That helper re-encodes through Cloudflare's resizer, which answers
 * with a real JPEG.
 *
 * Observed exactly that way: the first poster this endpoint rendered was
 * correct in every respect and had a blank space where the cover belonged.
 */
function posterPhoto(src: string | undefined): string | undefined {
  if (!src) return undefined;
  const absolute = /^https?:\/\//i.test(src) ? src : `${siteConfig.baseURL}${src}`;
  return resolveBackgroundImage(absolute) ?? undefined;
}

export const POSTER_SIGNATURE = siteConfig.title;
