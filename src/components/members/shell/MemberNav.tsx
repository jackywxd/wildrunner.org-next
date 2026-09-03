"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { User } from "@/payload-types";

const ITEMS = [
  { href: "/members", label: "總覽" },
  { href: "/members/profile", label: "個人資料" },
  { href: "/members/media", label: "媒體庫" },
  { href: "/members/posts", label: "文章" },
  { href: "/members/races", label: "比賽紀錄" },
];

function isActive(href: string, pathname: string | null): boolean {
  return href === "/members"
    ? pathname === "/members"
    : Boolean(pathname?.startsWith(href));
}

/**
 * The members-area navigation: a sidebar on desktop, a collapsed bar on
 * phones.
 *
 * WHY THE MOBILE HALF EXISTS. This was one `flex flex-col` at every width, so
 * on a phone every page in the members area opened with the brand, five
 * links, 切換到管理後台 and 登出 stacked vertically — measured at 375×812, the
 * content did not start until roughly 800px down, which is a whole screen of
 * scrolling before a member sees anything they came for.
 *
 * A COLLAPSING BAR RATHER THAN A BOTTOM TAB BAR, because there are seven
 * destinations here and a tab bar holds five. Splitting them would put 登出
 * and the admin switch somewhere a member has to learn; one menu keeps every
 * destination in the same place it already was.
 *
 * The collapsed bar still names the current section. That is not decoration:
 * the desktop sidebar shows where you are with the highlighted row, and
 * hiding the list would otherwise throw that signal away.
 *
 * Nothing about the desktop layout changes — every `lg:` rule below restores
 * exactly what was here before, and the `data-testid`s are unchanged because
 * `scripts/assert-schema-screen.mjs` looks for `member-nav-profile` by name.
 */
export function MemberNav({ user }: { user: User }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /**
   * Close on navigation. The members area is a client-side routed app, so a
   * link tap changes `pathname` without remounting this component — without
   * this the menu would stay open over the page it just navigated to, which
   * reads as a tap that did nothing.
   */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const current = ITEMS.find((item) => isActive(item.href, pathname));

  return (
    <nav className="flex flex-col border-b border-border p-4 lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-3 lg:block">
        {/* The mark on its own, not the full lockup: this column is 224px and
            the wordmark would either wrap or force the nav wider. Same role
            BrandIcon plays in the admin sidebar, and mark-purple.svg carries
            its own colours so it needs no theme handling. */}
        <Link href="/" className="flex items-center gap-2 px-2 lg:mb-4">
          <Image
            alt=""
            className="size-8"
            height={32}
            priority
            src="/static/brand/mark-purple.svg"
            width={32}
          />
          <span className="font-heading text-sm font-semibold">會員中心</span>
        </Link>

        <button
          aria-controls="member-nav-items"
          aria-expanded={open}
          className="flex items-center gap-2 border border-border px-3 py-2 text-sm text-foreground/70 lg:hidden"
          data-testid="member-nav-toggle"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span>{current?.label ?? "選單"}</span>
          {open ? (
            <X aria-hidden className="size-4" />
          ) : (
            <Menu aria-hidden className="size-4" />
          )}
          <span className="sr-only">{open ? "關閉選單" : "開啟選單"}</span>
        </button>
      </div>

      {/* `hidden`/`flex` toggles the phone view only; `lg:flex` pins the
          sidebar open regardless of `open`, so the button's state can never
          leak into the desktop layout. */}
      <div
        className={cn(
          "flex-col gap-1 pt-4 lg:flex lg:flex-1 lg:pt-0",
          open ? "flex" : "hidden",
        )}
        id="member-nav-items"
      >
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-testid={`member-nav-${item.href.split("/").pop()}`}
            className={cn(
              "px-3 py-2 text-sm transition-colors",
              isActive(item.href, pathname)
                ? "bg-primary text-primary-foreground"
                : "text-foreground/70 hover:bg-secondary hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
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
      </div>
    </nav>
  );
}
