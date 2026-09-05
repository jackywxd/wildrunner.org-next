import React, { PropsWithChildren } from "react";
import Link from "next/link";

import SiteHeader from "@/components/site-header";
import { siteConfig } from "@/config/site";
import { getCurrentUser } from "@/lib/auth";
import { getSiteGlobals } from "@/lib/content";
import { resolveNavItems } from "@/lib/nav";
import { getDictionary } from "@/lib/i18n/dictionary";

export default async function App({ children }: PropsWithChildren) {
  // getCurrentUser is React-cached (auth.ts), so this costs nothing extra on
  // pages that also call requireMember/getCurrentUser themselves — same
  // payload.auth() call, deduped per request.
  const [globals, user, t] = await Promise.all([
    getSiteGlobals(),
    getCurrentUser(),
    getDictionary(),
  ]);
  // The four words named one at a time rather than handing over `t.nav`.
  // `U-DICT-1` proves every key in the dictionary is read by something, and
  // it can only see a key that appears in the source — a whole-section
  // handoff would make all four look unused and, worse, would keep looking
  // used after the nav stopped rendering one of them.
  const navItems = resolveNavItems(globals, {
    posts: t.nav.posts,
    gallery: t.nav.gallery,
    riders: t.nav.riders,
    about: t.nav.about,
  });
  const member = user ? { displayName: user.displayName ?? null, email: user.email } : null;

  return (
    <div className="flex min-h-dvh flex-col space-y-6">
      <SiteHeader member={member} navItems={navItems} />
      <main className="container flex-1">{children}</main>
      <footer className="container border-t-2 border-t-border py-3">
        <p className="text-xs text-muted-foreground text-left">
          &copy; {new Date().getFullYear()} Created by{" "}
          <Link
            target="_blank"
            rel="noreferrer"
            href={globals.social.github || siteConfig.social.github}
            className="text-primary"
          >
            {siteConfig.author}
          </Link>{" "}
        </p>
      </footer>
    </div>
  );
}
