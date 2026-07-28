"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AlignLeft, X } from "lucide-react";

import HeaderNav from "@/components/header-nav";
import MobileNav from "@/components/mobile-nav";
import SiteLogo from "@/components/site-logo";
import ThemeToggle from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import type { NavItemData } from "@/lib/nav";

export default function SiteHeader({ navItems }: { navItems: NavItemData[] }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b-2 border-b-border bg-background px-2">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
        <Link href="/" aria-label={siteConfig.name} className="flex items-center">
          <SiteLogo />
        </Link>
        <div className="flex items-center space-x-3 md:space-x-5">
          <HeaderNav items={navItems} />
          <ThemeToggle />
          <Button
            variant="ghost"
            className="p-0 text-primary hover:bg-transparent hover:text-primary md:hidden"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
          >
            <>
              {isMobileOpen ? (
                <X className="size-6" />
              ) : (
                <AlignLeft className="size-6" />
              )}
              <span className="sr-only">Menu</span>
            </>
          </Button>
        </div>
      </div>
      {isMobileOpen && (
        <MobileNav
          items={navItems}
          onOpenChange={() => setIsMobileOpen(false)}
        />
      )}
    </header>
  );
}
