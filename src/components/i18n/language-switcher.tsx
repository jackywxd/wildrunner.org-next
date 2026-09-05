"use client";

import { ChevronDown, Languages } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { useDictionary } from "@/components/i18n/dictionary-provider";
import { LOCALES, isLocaleSegment, localizedPath } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

/**
 * The languages, as a menu of links to this same page.
 *
 * WHY IT READS THE PATH RATHER THAN TAKING THE LOCALE AS A PROP. This sits in
 * `SiteHeader`, which is a Client Component rendered once per page, and
 * `next/root-params` is Server-Component-only. `usePathname()` returns what
 * the address bar shows — `/posts` on the default language, because the
 * rewrite that adds `/zh-hant` is internal and never reaches the browser, and
 * `/zh-hans/posts` on the other. Both halves of what this needs are in that
 * one string.
 *
 * NO COOKIE, AND NO AUTOMATIC REDIRECT. The plan suggested remembering the
 * choice in a cookie, and every use of one turns out to be a thing the same
 * plan rules out: making the unprefixed address serve a different language
 * per cookie is the cache split it says to avoid, and sending a reader
 * somewhere else on arrival is the automatic redirect it rejects by name. A
 * menu of links has neither problem: the address says which language it is,
 * and it is the reader who chose it.
 *
 * WHY EVERY LANGUAGE IS LISTED, including the one being read. A control that
 * only offers the others makes the reader work out which one they are on from
 * the page itself — which is exactly what somebody who landed on the wrong
 * language cannot do. The trigger shows the current one for the same reason,
 * so that answer costs no clicks at all.
 *
 * WHY `<details>` AND NOT A NATIVE `<select>`, which is what `FilterSelect`
 * uses and argues for in its own header ("the one control that works on a
 * phone without any of our own code"). That reasoning is about phones and
 * `<details>` satisfies it equally. The difference is what the options *are*:
 * a filter's options are app state, and these are addresses. A `<select>`
 * cannot hold an `<a>`, so the switch would become a `router.push` in an
 * `onChange` — which means the one control a reader who landed in the wrong
 * language needs would be the one that stops working if the bundle does not.
 * These stay real links with real `hreflang`, and `<details>` opens them with
 * no script at all.
 *
 * The script below is only about *closing*: `<details>` has no notion of
 * clicking away from it or of Escape, and a soft navigation leaves `open` set
 * because that is DOM state this component never rewrites.
 */
export default function LanguageSwitcher({ className }: { className?: string }) {
  const t = useDictionary();
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);

  const [, first = "", ...rest] = pathname.split("/");
  const prefixed = isLocaleSegment(first);
  // The address with no language in it, which is what `localizedPath` takes.
  const bare = prefixed ? `/${rest.join("/")}` : pathname;
  const current = prefixed ? first : LOCALES[0].segment;
  const reading = LOCALES.find((locale) => locale.segment === current) ?? LOCALES[0];

  useEffect(() => {
    const close = (event: Event) => {
      const element = menu.current;
      if (!element?.open) return;
      if (event.type === "pointerdown" && element.contains(event.target as Node)) {
        return;
      }
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") {
        return;
      }
      element.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details
      className={cn("relative w-fit text-xs leading-tight", className)}
      data-testid="language-switcher"
      ref={menu}
    >
      <summary
        aria-label={t.language.choose}
        // `list-none` alone is not enough: Safari draws the marker through a
        // pseudo-element that ignores it, so both have to go.
        className="flex cursor-pointer list-none items-center gap-1 border border-transparent px-1.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden"
        data-testid="language-switcher-toggle"
      >
        <Languages aria-hidden className="size-4" />
        <span>{reading.short}</span>
        <ChevronDown aria-hidden className="size-3" />
      </summary>

      <nav
        aria-label="Language"
        className="absolute right-0 z-50 mt-1 flex min-w-max flex-col border border-border bg-background"
        // Shut on the way out. The header survives a soft navigation, so the
        // panel would otherwise hang open over the page the reader just asked
        // for — and watching `pathname` instead is not enough, because
        // choosing the language already being read navigates to the address
        // the reader is on and changes nothing to watch. Delegated to the
        // panel rather than put on each link: the `<a>` is the event's target,
        // so Next's own handler has already run by the time this bubbles.
        onClick={() => {
          if (menu.current) menu.current.open = false;
        }}
      >
        {LOCALES.map(({ segment, tag, label }) => {
          const active = segment === current;
          return (
            <Link
              // `"page"` and not `"true"`: this link points at the page the
              // reader is already on, which is the token's specific meaning
              // and the one `RiderViewTabs` already uses for the same
              // situation. `"true"` is the generic fallback, and in this
              // codebase it is spoken for — `RiderFilters` and
              // `RaceScheduleFilters` mark a selected filter chip with it, and
              // `RF-T3` asserts page-wide that no chip is selected. A nav
              // control wearing the chip token put a second meaning on one
              // attribute value and broke that assertion on every page at once.
              aria-current={active ? "page" : undefined}
              className={cn(
                "px-3 py-2 text-left transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
              data-testid={`language-${segment}`}
              href={localizedPath(segment, bare === "" ? "/" : bare)}
              // The IETF tag, not the URL segment: `hreflang` is read by
              // crawlers and assistive tech, and `zh-hant` is not a language
              // tag — `zh-Hant` is. `locales.ts` keeps the two apart because
              // a path is typed by people and a tag is parsed by machines.
              hrefLang={tag}
              key={segment}
            >
              {/* The full name, not the one-character short form: a menu has
                  the room the header did not, and `label` is written in its
                  own language so the reader who needs it can recognise it. */}
              {label}
            </Link>
          );
        })}
      </nav>
    </details>
  );
}
