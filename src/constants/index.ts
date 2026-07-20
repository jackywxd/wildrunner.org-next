import { Icons } from "@/components/icons";
import { siteConfig } from "@/config/site";
import { Bot, Rss, Image } from "lucide-react";

export const NAV_LIST = [
  { label: "文章", path: "/posts", icon: Rss },
  { label: "相冊", path: "/gallery", icon: Image },
  { label: "關於", path: "/about", icon: Bot },
];

export const SOCIALS = [
  { label: "Github", path: siteConfig.social.github, icon: Icons.github },
  { label: "Facebook", path: siteConfig.social.facebook, icon: Icons.facebook },
  { label: "Twitter", path: siteConfig.social.twitter, icon: Icons.x },
];
