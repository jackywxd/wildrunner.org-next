import React, { PropsWithChildren } from "react";
import Link from "@/components/i18n/locale-link";

import SiteHeader from "@/components/site-header";
import { siteConfig } from "@/config/site";
import { getSiteGlobals } from "@/lib/content";
import { resolveNavItems } from "@/lib/nav";
import { getDictionary } from "@/lib/i18n/dictionary";

export default async function App({ children }: PropsWithChildren) {
  // No `getCurrentUser()` here: it reads `headers()`, which would make every
  // public route dynamic. The header asks for the member itself — see
  // `useMember` in site-header.tsx.
  const [globals, t] = await Promise.all([getSiteGlobals(), getDictionary()]);
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

  return (
    <div className="flex min-h-dvh flex-col space-y-6">
      <SiteHeader navItems={navItems} />
      {/* No `container` here: every page carries its own, with the
          `max-w-*` that suits it, and the two stacked doubled the gutter —
          32px a side on a phone instead of 16, 48 under the gallery's layout,
          which is five or six characters of every line on a 375px screen. */}
      <main className="flex-1">{children}</main>
      <footer className="container border-t-2 border-t-border py-3">
        <p className="text-sm text-muted-foreground text-left">
          &copy; {new Date().getFullYear()} {t.common.createdBy}{" "}
          <Link
            target="_blank"
            rel="noreferrer"
            href={globals.social.github || siteConfig.social.github}
            className="hit-area text-primary"
          >
            {siteConfig.author}
          </Link>{" "}
        </p>
      </footer>
    </div>
  );
}
