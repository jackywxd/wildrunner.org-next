import React, { PropsWithChildren } from "react";
import Link from "next/link";

import SiteHeader from "@/components/site-header";
import { siteConfig } from "@/config/site";
import { getSiteGlobals } from "@/lib/content";
import { resolveNavItems } from "@/lib/nav";

export default async function App({ children }: PropsWithChildren) {
  const globals = await getSiteGlobals();
  const navItems = resolveNavItems(globals);

  return (
    <div className="flex min-h-dvh flex-col space-y-6">
      <SiteHeader navItems={navItems} />
      <main className="container flex-1">{children}</main>
      <footer className="container border-t-2 border-t-border py-3">
        <p className="text-xs text-muted-foreground text-left">
          &copy; 2024 Created by{" "}
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
