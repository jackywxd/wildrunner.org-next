"use client";

import { Bot, Image, Rss, type LucideIcon } from "lucide-react";

import type { NavItemData } from "@/lib/nav";

const ICONS: Record<NavItemData["icon"], LucideIcon> = {
  rss: Rss,
  image: Image,
  about: Bot,
};

export function navIcon(name: NavItemData["icon"]): LucideIcon {
  return ICONS[name] ?? Rss;
}
