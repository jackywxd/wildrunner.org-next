"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { User } from "@/payload-types";

const ITEMS = [
  { href: "/members", label: "總覽" },
  { href: "/members/profile", label: "個人資料" },
  { href: "/members/media", label: "媒體庫" },
  { href: "/members/posts", label: "文章" },
];

export function MemberNav({ user }: { user: User }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 border-b border-border p-4 lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="mb-4 flex items-center gap-2 px-2">
        <div className="h-8 w-8 bg-primary" aria-hidden />
        <span className="font-heading text-sm font-semibold">會員中心</span>
      </div>
      {ITEMS.map((item) => {
        const active =
          item.href === "/members"
            ? pathname === "/members"
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
      <div className="mt-auto space-y-1 border-t border-border pt-4">
        {user.role === "admin" && (
          <a
            href="/admin"
            data-testid="member-nav-admin-switch"
            className="block px-3 py-2 text-sm text-foreground/70 hover:bg-secondary hover:text-foreground"
          >
            切換到管理後台
          </a>
        )}
        <button
          type="button"
          data-testid="member-nav-logout"
          onClick={() => {
            fetch("/api/users/logout", {
              method: "POST",
              credentials: "same-origin",
            }).finally(() => {
              window.location.href = "/members/login";
            });
          }}
          className="block w-full px-3 py-2 text-left text-sm text-foreground/70 hover:bg-secondary hover:text-foreground"
        >
          登出
        </button>
      </div>
    </nav>
  );
}
