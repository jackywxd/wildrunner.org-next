"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

import { localeHref } from "@/lib/i18n/locale-href";

/**
 * `next/link`, except it stays in the language the reader is reading.
 *
 * WHY EVERY INTERNAL LINK HAS TO GO THROUGH SOMETHING. `/zh-hans` lasted
 * exactly one click: the address bar said Simplified, and then every link on
 * the page — the nav, each article card, the footer, "back to 文章" — was the
 * unprefixed address, which `next.config.ts` rewrites to the default locale.
 * The reader was returned to Traditional by the first thing they clicked, and
 * the language switcher was decoration.
 *
 * WHY A COMPONENT AND NOT A BUNDLER ALIAS ON `next/link`. An alias needs no
 * call-site changes at all, which is exactly what makes it the wrong choice
 * here. Two reasons, both specific to this repo rather than general taste:
 *
 *   1. `next dev` runs Turbopack and the production build opts back out with
 *      `--webpack` (AGENTS.md records why: Turbopack rewrites the specifier
 *      `@payloadcms/drizzle` uses to reach `drizzle-kit/api`, and OpenNext's
 *      esbuild pass then cannot resolve it). So an alias has to be declared
 *      twice, in two resolvers, one of which has already misbehaved on
 *      specifier rewriting in this project.
 *   2. It would be invisible. Somebody reading `<Link href="/posts">` would
 *      have no way to see that it is rewritten, and `node_modules` — Payload's
 *      own admin included — would be rewritten too.
 *
 * An explicit component is greppable, and the rule can be *enforced*:
 * `U-LINKREACH-1` walks the import graph from every `[lang]` route and fails
 * if anything under it reaches `next/link` directly. A page that forgets is a
 * red test, not a page that quietly drops the reader's language.
 *
 * `usePathname()` RATHER THAN `lang()`. Same reason `LanguageSwitcher` reads
 * it: `next/root-params` is Server-Component-only, and this has to work in
 * both trees. The address bar already holds the answer.
 *
 * A `UrlObject` href is passed through untouched — nothing in this app uses
 * one, and guessing at how to rewrite an object is how a link starts pointing
 * somewhere nobody intended.
 */
export default function LocaleLink({
  href,
  ...rest
}: ComponentProps<typeof Link>) {
  const pathname = usePathname() || "/";
  return (
    <Link
      href={typeof href === "string" ? localeHref(href, pathname) : href}
      {...rest}
    />
  );
}
