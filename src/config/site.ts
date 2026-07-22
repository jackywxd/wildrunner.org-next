import authorAvatar from "../../public/images/author/devbertskie.png";

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
  authorImage: authorAvatar,
  slogan: "心如野馬，馳騁天下",
  social: {
    github: "https://github.com/jackywxd",
    twitter: "https://twitter.com",
    facebook: "https://facebook.com",
  },
};

export type SiteConfig = typeof siteConfig;
