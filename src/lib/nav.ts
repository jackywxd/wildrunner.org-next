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
  if (key.includes("gallery") || key.includes("image") || key.includes("相册")) {
    return "image";
  }
  if (key.includes("about") || key.includes("user") || key.includes("关于")) {
    return "about";
  }
  // Matched on the href as well as the icon string, because the Chinese
  // keywords above are written in simplified form and the labels have since
  // been changed to traditional (相冊, 關於). Those two still resolve only
  // because /gallery and /about carry an English keyword — a row whose href
  // has none falls straight through, which is what put the RSS icon on 賽事.
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
