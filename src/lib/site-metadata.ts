import type { Metadata } from "next";

import { siteConfig } from "@/config/site";
import { absoluteImageUrl } from "@/lib/postOg";

/**
 * One page's title, description and share card, decided in one place.
 *
 * WHY THIS EXISTS, measured rather than assumed. Six routes each carried
 * their own ~25-line `openGraph` + `twitter` block: each built the canonical
 * URL by hand, each assembled its own `/og` query, each decided its own
 * `alt`. Reading what the site actually served on 2026-09-03 found what that
 * costs:
 *
 *   - **Four cards had the site name where the byline goes.** `/og` splits
 *     its `title` on the last `|` and treats the tail as a byline — the
 *     `title|author` convention posts use. Those routes handed it their
 *     BROWSER TAB TITLE, which is built by joining segments with `|`. So
 *     `/posts` asked for a card headlined 「文章 | Posts | 野馬營」 and got one
 *     headlined 「文章 | Posts」 signed 「野馬營」 — a byline naming the site
 *     whose mark is already in the corner.
 *   - **`/gallery` did not encode its query at all**, so a raw `|` and raw
 *     spaces went into the URL.
 *   - **Two routes had no card.** `/about` had no `openGraph` block; the race
 *     edition page had one with no `images` — a single missing line that
 *     nothing could notice.
 *
 * THE FIX IS THE PARAMETER LIST, not a rule anybody has to remember. A route
 * supplies its SUBJECT and a sentence about it; this composes the tab title,
 * the description, the canonical URL and the card. A route never writes a
 * separator, so a separator can never reach the card generator — the first
 * three failures above stop being possible rather than stopping being
 * present. And a card is not optional, so the fourth cannot recur either.
 *
 * `title` and `subtitle` travel to `/og` as separate query parameters. That
 * is not a new idea: `buildVideoOgImageUrl` in `galleryOg.ts` already did it,
 * and the video share page is the one route the audit found with a clean
 * card. This makes the rest of the site do what that one already did.
 */

/**
 * Which of `/og`'s four treatments this page gets.
 *
 * All four already exist in the site; this only names them. See the route's
 * own header for what each looks like.
 */
export type OgCard =
  /** Generated card: paper ground, ink type. The site's own furniture. */
  | { kind: "plain" }
  /**
   * Generated card with a spectrum seeded on `seed`, for a thing that IS
   * something but has no photograph. The seed must be the thing's stable id
   * — a slug or an event key, never its title — so that renaming it does not
   * change the card it has already been shared with.
   */
  | { kind: "rainbow"; seed: string }
  /** The photograph itself is the card. Posts and albums with a cover. */
  | { kind: "photo"; src: string }
  /** A generated card laid over the photograph. Media and video shares. */
  | { kind: "photo-card"; src: string };

export type PageMetadataInput = {
  /** Absolute path on this site, e.g. `/races`. The canonical URL is built from it. */
  path: string;
  /**
   * The subject alone — 「文章」, not 「文章 | Posts | 野馬營」.
   *
   * The site name is appended for the browser tab by the root layout's title
   * template, and deliberately NOT sent to the card: the card already carries
   * the lockup in its corner, so repeating the name in the headline spends
   * the largest type on the page saying what the logo just said.
   */
  title: string;
  /** One sentence about this page. Becomes both the description and the card's byline. */
  subtitle: string;
  card: OgCard;
  /** `article` for a post, `profile` for a member; everything else is a `website`. */
  type?: "article" | "profile" | "website";
};

/** `/og` renders at 1920×1080; saying so lets a crawler lay out before it fetches. */
const CARD_WIDTH = 1920;
const CARD_HEIGHT = 1080;

export function pageMetadata({
  path,
  title,
  subtitle,
  card,
  type = "website",
}: PageMetadataInput): Metadata {
  const baseURL = siteConfig.baseURL.replace(/\/$/, "");
  const url = `${baseURL}${path.startsWith("/") ? path : `/${path}`}`;
  const image = cardUrl(card, { baseURL, title, subtitle });

  return {
    // The bare subject. `(site)/layout.tsx`'s template appends the site name,
    // so a route that added it itself would produce it twice — which is
    // exactly what every route did before this existed.
    //
    // The home page is the one page whose subject IS the site, and the
    // template has no way to know that: it produced 「野馬營｜野馬營」.
    // `absolute` opts that one page out of the template rather than teaching
    // every caller a flag for a case there is only one of.
    title: title === siteConfig.title ? { absolute: title } : title,
    description: subtitle,
    openGraph: {
      title,
      description: subtitle,
      // Named once here rather than folded into every title: a crawler that
      // knows the site name shows it separately, and one that does not is no
      // worse off than it was.
      siteName: siteConfig.title,
      type,
      url,
      images: [
        { url: image, alt: title, width: CARD_WIDTH, height: CARD_HEIGHT },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: subtitle,
      images: [image],
    },
  };
}

/**
 * The card's URL.
 *
 * `photo` hands back the photograph, absolutised — a crawler reading
 * `og:image` has no page to resolve a path against. Every other treatment is
 * a `/og` request whose parameters are built by `URLSearchParams`, which is
 * what makes the encoding bug unrepeatable: nothing here interpolates a title
 * into a string.
 */
function cardUrl(
  card: OgCard,
  context: { baseURL: string; title: string; subtitle: string },
): string {
  if (card.kind === "photo") {
    return absoluteImageUrl(card.src, context.baseURL);
  }

  const params = new URLSearchParams();
  params.set("title", context.title);
  params.set("subtitle", context.subtitle);

  if (card.kind === "rainbow") {
    params.set("variant", "rainbow");
    params.set("seed", card.seed);
  }

  if (card.kind === "photo-card") {
    // `/og` only accepts an absolute image, and `resolveBackgroundImage`
    // refuses anything off our own hosts — so a relative one would be
    // silently dropped and the card would render as `plain` with nobody the
    // wiser.
    params.set("image", absoluteImageUrl(card.src, context.baseURL));
  }

  return `${context.baseURL}/og?${params.toString()}`;
}
