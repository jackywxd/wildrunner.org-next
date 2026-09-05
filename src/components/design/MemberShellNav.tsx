"use client";

import Link from "@/components/i18n/locale-link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Sidebar nav for the design mockup — stands in for what Phase D's real
 * MemberNav will be. Static routes, no data; only the active-link
 * highlighting is real interactivity.
 */
const ITEMS = [
  { href: "/design-preview", label: "總覽" },
  { href: "/design-preview/profile", label: "個人資料" },
  { href: "/design-preview/media", label: "媒體庫" },
  { href: "/design-preview/posts", label: "文章" },
];

export function MemberShellNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 border-r border-border p-4 fhd:w-56">
      <div className="mb-4 flex items-center gap-2 px-2">
        <div className="h-8 w-8 bg-primary" aria-hidden />
        <span className="font-heading text-sm font-semibold">會員中心</span>
      </div>
      {ITEMS.map((item) => {
        const active =
          item.href === "/design-preview"
            ? pathname === "/design-preview"
            : pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={`member-nav-${item.href.split("/").pop()}`}
            className={cn(
              "px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground/70 hover:bg-secondary hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
