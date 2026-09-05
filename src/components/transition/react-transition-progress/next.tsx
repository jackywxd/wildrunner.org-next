"use client";
import React from "react";
import { startTransition } from "react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useProgress } from ".";
import { localeHref } from "@/lib/i18n/locale-href";

// Copied from  https://github.com/vercel/next.js/blob/canary/packages/next/src/client/link.tsx#L180-L191
function isModifiedEvent(event: React.MouseEvent): boolean {
  const eventTarget = event.currentTarget as HTMLAnchorElement | SVGAElement;
  const target = eventTarget.getAttribute("target");
  return (
    (target && target !== "_self") ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey || // triggers resource download
    (event.nativeEvent && event.nativeEvent.which === 2)
  );
}

/**
 * A custom Link component that wraps Next.js's next/link component.
 *
 * IT REACHES `next/link` DIRECTLY, AND CARRIES THE READER'S LANGUAGE ITSELF
 * — the one file besides `LocaleLink` that does both. Wrapping `LocaleLink`
 * instead would only fix half of it: this component preventDefaults and
 * navigates by hand, so the address it *pushes* has to be rewritten too, and
 * that is not something the component underneath can do for it. Passing the
 * rewritten address to `NextLink` as well is harmless — `localeHref` returns
 * an address that already names a language unchanged.
 */
export function Link({ href, children, replace, ...rest }: Parameters<typeof NextLink>[0]) {
  const router = useRouter();
  const pathname = usePathname();
  const startProgress = useProgress();
  const target = typeof href === "string" ? localeHref(href, pathname) : href;

  return (
    <NextLink
      href={target}
      onClick={(e) => {
        if (isModifiedEvent(e)) return;
        e.preventDefault();
        startTransition(() => {
          startProgress();
          const url = target.toString();
          if (replace) {
            router.replace(url);
          } else {
            router.push(url);
          }
        });
      }}
      {...rest}
    >
      {children}
    </NextLink>
  );
}
