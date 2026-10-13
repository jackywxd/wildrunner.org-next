import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

/**
 * `/robots.txt`. At the app root beside `sitemap.ts`, for the same reason:
 * one file for the whole site, at the address a crawler looks for.
 *
 * THE ONLY RULE IS THE BADGE FILTER. `/riders?badge=…` toggles, so every
 * subset of the badges is its own address, and every one is a force-dynamic
 * render. Crawlers found that space in 2026-09 and it became the site's
 * entire Workers bill. Two patterns because the parameter is not always
 * first — Next's `_rsc` cache-buster can precede it.
 *
 * This is the polite half. Crawlers that ignore it are blocked on the zone by
 * a Cloudflare WAF rule matching verified bots on `badge=`; the page itself
 * also answers noindex and the chips are nofollow.
 */
export default function robots(): MetadataRoute.Robots {
  const baseURL = siteConfig.baseURL.replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/*?badge=", "/*&badge="] },
    sitemap: `${baseURL}/sitemap.xml`,
  };
}
