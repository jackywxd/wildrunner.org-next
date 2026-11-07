"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "@/components/i18n/locale-link";
import { AlignLeft, LogIn, User as UserIcon, X } from "lucide-react";

import HeaderNav from "@/components/header-nav";
import MobileNav from "@/components/mobile-nav";
import SiteLogo from "@/components/site-logo";
import ThemeToggle from "@/components/theme-toggle";
import LanguageSwitcher from "@/components/i18n/language-switcher";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import type { NavItemData } from "@/lib/nav";
import { useDictionary } from "@/components/i18n/dictionary-provider";
import { cn } from "@/lib/utils";

type Member = { displayName: string | null; email: string };

/**
 * Who is signed in, asked from the browser.
 *
 * WHY NOT ON THE SERVER. This used to arrive as a prop from `App`, which read
 * it with `getCurrentUser()` — and that reads `headers()`. Inside the layout
 * that wraps the whole public site, one `headers()` makes every route beneath
 * it dynamic, so the article page's `generateStaticParams` and the R2 cache it
 * was written for never served a single request. Every view booted Payload and
 * walked D1 for a page that is the same for everybody, and field data put that
 * at a 4.1s P75 time to first byte — most of the article's LCP. The member's
 * name is the only per-visitor thing on these pages, so it is the part that
 * moves.
 *
 * `undefined` is "not known yet", distinct from `null` for "nobody". Until the
 * answer is in, the sign-in link is laid out but not shown: a member would
 * otherwise see 登入 flash before their own name, and a visitor's header would
 * shift sideways as the slot filled. A failed request reads as nobody, which
 * is what the page showed a visitor before.
 *
 * Same request `members/login` already makes, for the same reason. A
 * client-side `fetch` sends `Origin`, so it is not subject to the
 * missing-Origin rejection `src/lib/auth-origin.ts` exists for.
 */
function useMember(): Member | null | undefined {
  const [member, setMember] = useState<Member | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/users/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return;
        const user = (body as { user?: Partial<Member> | null } | null)?.user;
        setMember(
          user?.email
            ? { displayName: user.displayName ?? null, email: user.email }
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setMember(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return member;
}

export default function SiteHeader({
  navItems,
}: {
  navItems: NavItemData[];
}) {
  const t = useDictionary();
  const member = useMember();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  // Stable, because the menu keys its scroll lock and Escape listener on it.
  const closeMobile = useCallback(() => setIsMobileOpen(false), []);
  // Every control here is a 44px target on a phone. They were a 16px icon
  // (sign in), a 24px-wide button (the menu) and a 40px theme toggle — and
  // the theme toggle and language switcher now live inside the menu below
  // `md`, so the header carries only what a visitor reaches for.
  return (
    <header className="sticky top-0 z-40 border-b-2 border-b-border bg-background">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
        <Link href="/" aria-label={siteConfig.name} className="flex items-center">
          <SiteLogo />
        </Link>
        <div className="flex items-center space-x-1 md:space-x-5">
          <HeaderNav items={navItems} />
          {member ? (
            <Link
              className="flex h-11 min-w-11 items-center justify-center gap-1.5 text-sm text-foreground/80 hover:text-primary"
              data-testid="header-member-indicator"
              href="/members"
            >
              <UserIcon className="size-5 sm:size-4" />
              <span className="sr-only sm:not-sr-only">{member.displayName || member.email}</span>
            </Link>
          ) : (
            <Link
              className={cn(
                "flex h-11 min-w-11 items-center justify-center gap-1.5 text-sm text-foreground/80 hover:text-primary",
                member === undefined && "invisible",
              )}
              aria-hidden={member === undefined || undefined}
              tabIndex={member === undefined ? -1 : undefined}
              data-testid="header-login-link"
              href="/members/login"
            >
              <LogIn className="size-5 sm:size-4" />
              <span className="sr-only sm:not-sr-only">{t.nav.signIn}</span>
            </Link>
          )}
          <LanguageSwitcher className="hidden md:block" />
          <ThemeToggle className="hidden md:inline-flex" />
          <Button
            variant="ghost"
            size="icon"
            className="text-primary hover:bg-transparent hover:text-primary md:hidden"
            aria-controls="mobile-nav"
            aria-expanded={isMobileOpen}
            aria-label={isMobileOpen ? t.nav.closeMenu : t.nav.menu}
            data-testid="mobile-nav-toggle"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
          >
            {isMobileOpen ? (
              <X className="size-6" />
            ) : (
              <AlignLeft className="size-6" />
            )}
          </Button>
        </div>
      </div>
      {isMobileOpen && (
        <MobileNav
          id="mobile-nav"
          items={navItems}
          onOpenChange={closeMobile}
        />
      )}
    </header>
  );
}
