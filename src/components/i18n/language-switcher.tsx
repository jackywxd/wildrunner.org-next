"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LOCALES, isLocaleSegment, localizedPath } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

/**
 * The three languages, as three links to this same page.
 *
 * WHY IT READS THE PATH RATHER THAN TAKING THE LOCALE AS A PROP. This sits in
 * `SiteHeader`, which is a Client Component rendered once per page, and
 * `next/root-params` is Server-Component-only. `usePathname()` returns what
 * the address bar shows — `/posts` on the default language, because the
 * rewrite that adds `/zh-hant` is internal and never reaches the browser, and
 * `/zh-hans/posts` on the others. Both halves of what this needs are in that
 * one string.
 *
 * NO COOKIE, AND NO AUTOMATIC REDIRECT. The plan suggested remembering the
 * choice in a cookie, and every use of one turns out to be a thing the same
 * plan rules out: making the unprefixed address serve a different language
 * per cookie is the cache split it says to avoid, and sending a reader
 * somewhere else on arrival is the automatic redirect it rejects by name — a
 * Chinese reader in Vancouver with an English-language laptop should not be
 * thrown at the English site. Three links have neither problem: the address
 * says which language it is, and it is the reader who chose it.
 *
 * WHY EVERY LANGUAGE IS SHOWN, including the one being read. A control that
 * only offers the other two makes the reader work out which one they are on
 * from the page itself — which is exactly what somebody who landed on the
 * wrong language cannot do.
 */
export default function LanguageSwitcher({ className }: { className?: string }) {
  const pathname = usePathname() || "/";
  const [, first = "", ...rest] = pathname.split("/");
  const prefixed = isLocaleSegment(first);
  // The address with no language in it, which is what `localizedPath` takes.
  const bare = prefixed ? `/${rest.join("/")}` : pathname;
  const current = prefixed ? first : LOCALES[0].segment;

  return (
    <nav
      aria-label="Language"
      className={cn("flex items-center gap-1 text-xs leading-tight", className)}
      data-testid="language-switcher"
    >
      {LOCALES.map(({ segment, tag, label, short }) => {
        const active = segment === current;
        return (
          <Link
            // `"page"` and not `"true"`: this link points at the page the
            // reader is already on, which is the token's specific meaning and
            // the one `RiderViewTabs` already uses for the same situation.
            // `"true"` is the generic fallback, and in this codebase it is
            // spoken for — `RiderFilters` and `RaceScheduleFilters` mark a
            // selected filter chip with it, and `RF-T3` asserts page-wide that
            // no chip is selected. A nav control wearing the chip token put a
            // second meaning on one attribute value and broke that assertion
            // on every page at once.
            aria-current={active ? "page" : undefined}
            className={cn(
              "border px-1.5 py-0.5 transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            data-testid={`language-${segment}`}
            href={localizedPath(segment, bare === "" ? "/" : bare)}
            // The IETF tag, not the URL segment: `hreflang` is read by
            // crawlers and assistive tech, and `zh-hant` is not a language
            // tag — `zh-Hant` is. `locales.ts` keeps the two apart because
            // a path is typed by people and a tag is parsed by machines.
            hrefLang={tag}
            key={segment}
            title={label}
          >
            {short}
          </Link>
        );
      })}
    </nav>
  );
}
