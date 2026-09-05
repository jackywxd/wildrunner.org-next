import type { SiteGlobals } from "@/lib/content-types";
import { NAV_LIST } from "@/constants";

export type NavItemData = {
  label: string;
  path: string;
  icon: "rss" | "image" | "about" | "riders" | "races";
};

/**
 * The label for a path the site itself owns, in the language being read.
 *
 * WHY THE CMS NO LONGER DECIDES THESE FOUR WORDS. `topNavItems` is a D1 row
 * an admin typed once, in one language — and the rows staging and production
 * actually hold are a mix of scripts (`相册`, `关于` in Simplified next to
 * `成員` in Traditional), which is how the Traditional site came to show two
 * Simplified words in its own header. One label cannot be right on
 * /zh-hant/posts and /zh-hans/posts at the same time, and the alternative —
 * three label columns on the global — is a migration, which this stage of the
 * work does not have.
 *
 * So the CMS keeps deciding *which* pages are in the nav and in what order,
 * which is the part an editor actually curates, and the four paths the site
 * ships take their word from the dictionary. A row pointing anywhere else
 * still shows the label that was typed for it: an editor adding a link is not
 * overruled, they simply get the one language they wrote it in.
 */
function labelForPath(path: string, labels: NavLabels): string | null {
  if (path.startsWith("/posts")) return labels.posts;
  if (path.startsWith("/gallery")) return labels.gallery;
  if (path.startsWith("/riders")) return labels.riders;
  if (path.startsWith("/about")) return labels.about;
  return null;
}

/** The dictionary's `nav` section, as much of it as this needs. */
export type NavLabels = {
  posts: string;
  gallery: string;
  riders: string;
  about: string;
};

function iconForHref(href: string, iconName?: string | null): NavItemData["icon"] {
  const key = `${href} ${iconName ?? ""}`.toLowerCase();
  if (key.includes("rider") || key.includes("member") || key.includes("成員")) {
    return "riders";
  }
  if (
    key.includes("gallery") ||
    key.includes("image") ||
    key.includes("相冊") ||
    key.includes("相册")
  ) {
    return "image";
  }
  if (
    key.includes("about") ||
    key.includes("user") ||
    key.includes("關於") ||
    key.includes("关于")
  ) {
    return "about";
  }
  // BOTH SCRIPTS ARE MATCHED, and the simplified forms are not leftovers to
  // tidy away later: `global.json` now seeds traditional labels, but that
  // file only shapes a *fresh* database. Staging and production still hold
  // the simplified rows an admin typed, and will until somebody edits them
  // in /admin — so dropping 相册/关于 here would break the environments that
  // matter while every local database kept working.
  //
  // Matched on the href as well as the icon string: a row whose href carries
  // no English keyword falls straight through, which is what put the RSS
  // icon on 賽事.
  if (key.includes("race") || key.includes("event") || key.includes("賽事")) {
    return "races";
  }
  return "rss";
}

export function resolveNavItems(
  globals: SiteGlobals,
  labels: NavLabels,
): NavItemData[] {
  const items =
    globals.topNavItems.length > 0
      ? globals.topNavItems.map((item) => ({
          label: labelForPath(item.href, labels) ?? item.label,
          path: item.href,
          icon: iconForHref(item.href, item.icon),
        }))
      : NAV_LIST.map((item) => ({
          label: labelForPath(item.path, labels) ?? item.label,
          path: item.path,
          icon: iconForHref(item.path),
        }));

  // Appended in code rather than left to NAV_LIST. `topNavItems` is CMS data
  // and production already holds three rows, so the first branch always wins
  // there and NAV_LIST is dead code — editing only that would have shipped a
  // nav link that never appeared on the live site. Skipped once an editor adds
  // their own /riders row, so the CMS still decides position.
  if (!items.some((item) => item.path.startsWith("/riders"))) {
    items.push({ label: labels.riders, path: "/riders", icon: "riders" });
  }

  return items;
}
