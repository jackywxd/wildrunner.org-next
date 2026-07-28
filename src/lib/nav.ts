import type { SiteGlobals } from "@/lib/content-types";
import { NAV_LIST } from "@/constants";

export type NavItemData = {
  label: string;
  path: string;
  icon: "rss" | "image" | "about";
};

function iconForHref(href: string, iconName?: string | null): NavItemData["icon"] {
  const key = `${href} ${iconName ?? ""}`.toLowerCase();
  if (key.includes("gallery") || key.includes("image") || key.includes("相册")) {
    return "image";
  }
  if (key.includes("about") || key.includes("user") || key.includes("关于")) {
    return "about";
  }
  return "rss";
}

export function resolveNavItems(globals: SiteGlobals): NavItemData[] {
  if (globals.topNavItems.length > 0) {
    return globals.topNavItems.map((item) => ({
      label: item.label,
      path: item.href,
      icon: iconForHref(item.href, item.icon),
    }));
  }

  return NAV_LIST.map((item) => ({
    label: item.label,
    path: item.path,
    icon: iconForHref(item.path),
  }));
}
