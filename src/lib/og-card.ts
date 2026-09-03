/**
 * Which of `/og`'s four treatments a page's share card gets.
 *
 * ITS OWN MODULE, AND THE REASON IS THE UNIT LANE. `site-metadata.ts` reads
 * `siteConfig`, and `src/config/site.ts` imports an avatar PNG that the unit
 * lane's bundler cannot parse — importing it from `postOg.ts` broke
 * `post-og.spec.ts` the moment it was tried. The type and the one function the
 * resolvers need therefore live here, where nothing reaches the config, so the
 * ladder functions stay unit-testable and `site-metadata.ts` composes on top.
 *
 * THE LADDER THIS TYPE DESCRIBES is the same one everywhere on the site, and
 * it is worth stating in one place:
 *
 *   1. a real photograph, when the thing has one
 *   2. a `rainbow` card seeded on the thing's own stable id, when it IS
 *      something but has no picture — a race edition, a member, an empty album
 *   3. a `plain` card, for the site's own furniture — the indexes and /about
 */

export type OgCard =
  /** Generated card: paper ground, ink type. The site's own furniture. */
  | { kind: "plain" }
  /**
   * Generated card with a spectrum seeded on `seed`.
   *
   * The seed must be the thing's stable id — a slug or an event key, never its
   * title — so renaming it does not change the card it has already been shared
   * with. For a race edition it is `event.key`, which is also what
   * `races/design-tokens.ts` hashes for the badge colour: the card and the
   * badge on the page therefore always agree.
   */
  | { kind: "rainbow"; seed: string }
  /** The photograph itself is the card. Posts and albums with a picture. */
  | { kind: "photo"; src: string }
  /** A generated card laid over the photograph. Media and video shares. */
  | { kind: "photo-card"; src: string };

/**
 * `mediaImageSrc` strips our own origin, so media served from this site comes
 * back as a path. A crawler reading `og:image` has no page context to resolve
 * that against, so every candidate is absolutised before it ships.
 */
export function absoluteImageUrl(src: string, baseURL: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  const origin = baseURL.replace(/\/$/, "");
  return `${origin}${src.startsWith("/") ? src : `/${src}`}`;
}
