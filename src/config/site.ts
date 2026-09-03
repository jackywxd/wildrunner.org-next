/** Public canonical origin for OG / absolute metadata. Never localhost. */
export const CANONICAL_SITE_URL = "https://wildrunner.org";

/**
 * Absolute site origin for share metadata.
 * NEXT_PUBLIC_SITE_URL may be localhost in local .env; that must not ship in og:url / og:image.
 */
export function getSiteBaseURL(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (!raw || /localhost|127\.0\.0\.1/i.test(raw)) {
    return CANONICAL_SITE_URL;
  }
  return raw;
}

export const siteConfig = {
  baseURL: getSiteBaseURL(),
  name: "Wild Runner",
  title: "野馬營",
  description: "野馬營，一群野馬，一個家",
  author: "追雲逐雪",
  slogan: "心如野馬，馳騁天下",
  /**
   * Only `github`, and only because `app.tsx`'s footer falls back to it when
   * the Site global has none. `twitter` and `facebook` used to sit here as
   * "https://twitter.com" and "https://facebook.com" — the sites' own front
   * doors, not any club account — and the about page rendered both as
   * buttons. A link that goes somewhere plausible but wrong is worse than a
   * missing one: nothing about it looks broken. Add a real account here when
   * the club has one, never a placeholder.
   */
  social: {
    github: "https://github.com/jackywxd",
  },
};

export type SiteConfig = typeof siteConfig;
