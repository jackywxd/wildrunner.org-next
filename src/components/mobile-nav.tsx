"use client";

import React from "react";
import { usePathname } from "next/navigation";

import LanguageSwitcher from "@/components/i18n/language-switcher";
import Link from "@/components/i18n/locale-link";
import { useDictionary } from "@/components/i18n/dictionary-provider";
import { navIcon } from "@/components/nav-icons";
import ThemeToggle from "@/components/theme-toggle";
import { useDialogLock } from "@/components/use-dialog-lock";
import { localeHref } from "@/lib/i18n/locale-href";
import type { NavItemData } from "@/lib/nav";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  id: string;
  items: NavItemData[];
  onOpenChange: () => void;
}

/**
 * The phone's whole navigation, and on a phone the only place the language
 * and theme controls live — the header keeps just the sign-in and this
 * menu's button, each a full 44px target.
 *
 * WHAT IT FIXED, measured at 375px before the rewrite: rows 27px tall with
 * 24px of dead space between them, no backdrop (the page stayed visible and
 * scrollable underneath), a height of `100vh`, which on iOS includes the
 * strip under the browser's toolbar, and a language control 31px tall at
 * the very bottom.
 *
 * `top-16 bottom-0` rather than any `vh`: a fixed box pinned to both edges is
 * exactly the visible viewport, whatever the browser's chrome is doing.
 *
 * Each row is an ordinary `Link`. It used to also call `router.push` by hand
 * in its `onClick`, which navigated a second time on top of the one `Link`
 * already starts.
 */
export default function MobileNav({ id, items, onOpenChange }: MobileNavProps) {
  const t = useDictionary();
  const pathname = usePathname();

  useDialogLock(onOpenChange);

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-50 md:hidden" id={id}>
      <button
        aria-label={t.nav.closeMenu}
        className="absolute inset-0 bg-foreground/40 motion-safe:animate-in motion-safe:fade-in"
        onClick={onOpenChange}
        tabIndex={-1}
        type="button"
      />
      <div className="relative max-h-full overflow-y-auto border-b border-border bg-background pb-[env(safe-area-inset-bottom)] motion-safe:animate-in motion-safe:slide-in-from-top-2">
        <nav className="flex flex-col">
          {items.map((item) => {
            const Icon = navIcon(item.icon);
            // `Link` rewrites the address it renders, and the highlight
            // compares against the address bar — so it needs the same answer
            // `Link` reached, not the bare path the item carries.
            const active = pathname === localeHref(item.path, pathname);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 items-center gap-3 border-b border-l-4 border-b-border px-4 text-[17px] transition-colors",
                  active
                    ? "border-l-primary text-primary"
                    : "border-l-transparent text-foreground hover:text-primary",
                )}
                href={item.path}
                key={item.label + item.path}
                onClick={onOpenChange}
              >
                <Icon className="size-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Choosing a language navigates, and the menu has to go with it —
            delegated here because the links are the switcher's, not ours. */}
        <div
          className="space-y-3 px-4 py-4"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) onOpenChange();
          }}
        >
          <p className="text-sm text-muted-foreground">{t.language.choose}</p>
          <LanguageSwitcher variant="menu" />
        </div>

        <div className="border-t border-border px-2 py-2">
          <ThemeToggle className="min-h-14 text-[17px]" withLabel />
        </div>
      </div>
    </div>
  );
}
