import type { SiteGlobals } from "@/lib/content-types";
import { NAV_LIST } from "@/constants";

export type NavItemData = {
  label: string;
  path: string;
  icon: "rss" | "image" | "about" | "riders" | "races";
};

const RIDERS_ITEM: NavItemData = {
  label: "成員",
  path: "/riders",
  icon: "riders",
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

export function resolveNavItems(globals: SiteGlobals): NavItemData[] {
  const items =
    globals.topNavItems.length > 0
      ? globals.topNavItems.map((item) => ({
          label: item.label,
          path: item.href,
          icon: iconForHref(item.href, item.icon),
        }))
      : NAV_LIST.map((item) => ({
          label: item.label,
          path: item.path,
          icon: iconForHref(item.path),
        }));

  // Appended in code rather than left to NAV_LIST. `topNavItems` is CMS data
  // and production already holds three rows, so the first branch always wins
  // there and NAV_LIST is dead code — editing only that would have shipped a
  // nav link that never appeared on the live site. Skipped once an editor adds
  // their own /riders row, so the CMS still decides label and position.
  if (!items.some((item) => item.path.startsWith("/riders"))) {
    items.push(RIDERS_ITEM);
  }

  return items;
}
