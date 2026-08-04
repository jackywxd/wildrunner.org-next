"use client";

import {
  Bot,
  CalendarDays,
  Image,
  Rss,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { NavItemData } from "@/lib/nav";

/**
 * The nav icons, bundled rather than fetched.
 *
 * The Site global has an `icon` text field holding Iconify names
 * (`ph:article-medium`, `clarity:event-line`), but nothing renders those —
 * `iconForHref` only keyword-matches the string to pick one of these. So a
 * new nav row lands on the fallback until its keyword is added here, which
 * is how /races arrived wearing the RSS icon. Making that field actually
 * drive the icon means fetching icon data at runtime for the site header,
 * which is above the fold on every page; worth deciding on its own rather
 * than as a side effect of adding a link.
 */
const ICONS: Record<NavItemData["icon"], LucideIcon> = {
  rss: Rss,
  image: Image,
  about: Bot,
  riders: Users,
  races: CalendarDays,
};

export function navIcon(name: NavItemData["icon"]): LucideIcon {
  return ICONS[name] ?? Rss;
}
