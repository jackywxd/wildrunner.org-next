import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { pageMetadata } from "@/lib/site-metadata";
import { cn } from "@/lib/utils";
import "@/styles/globals.css";

/**
 * The page for every address this site does not have.
 *
 * WHAT WAS HERE BEFORE, measured on `pnpm dev` rather than assumed, because
 * the answer turned out to be three different pages depending on how the
 * request missed:
 *
 * | request                    | status | `<title>`                        |
 * |----------------------------|--------|----------------------------------|
 * | `/posts/<no such post>`    | 404    | 野馬營                            |
 * | `/gallery/<no such album>` | 404    | 相冊｜野馬營                       |
 * | `/this-route-does-not-exist` | 404  | 404: This page could not be found. |
 *
 * All three answered with an empty body or Next's own English default, and
 * the middle one is the worst of them: a missing album announced itself as
 * the album index — 「相冊」, the index's own share card, and an `og:url`
 * naming `/gallery`, which is a card asserting the page exists. The mechanism
 * is that **the metadata of a segment which threw is discarded**, so what is
 * served is its layout chain's, and `gallery/layout.tsx` carries the index's.
 *
 * The `metadata` export below is what displaces all of that, everywhere:
 * measured with `gallery/layout.tsx` untouched, a miss under `/gallery` now
 * answers with this file's title and card rather than the index's.
 *
 * THE SAME DISCARD IS WHY THREE `{ title: "找不到…" }` LINES WERE DEAD.
 * `gallery/[slug]`, `gallery/m/[mediaId]` and `gallery/[slug]/v/[videoId]`
 * each returned one from `generateMetadata` for the missing case, and not one
 * of them ever reached a browser — checked both before this file existed (the
 * served title was the layout's) and after (it is this file's). They are
 * gone; the 404's title is one string now rather than three.
 *
 * AT THE APP ROOT, because it is the only place Next looks for a URL that
 * matches no route at all — the typo, the old link structure, the bot
 * probing `/wp-admin`. A `not-found.tsx` inside a route group answers only
 * for `notFound()` thrown within it, and nothing inside a group can answer
 * for an address the router never resolved. Measured both ways.
 *
 * `(site)/(public)/not-found.tsx` re-exports this one for the opposite
 * reason, and its header explains it: a boundary at the root replaces the
 * header and footer along with the page.
 *
 * The cost of the root placement is the shell an unmatched URL gets. This app
 * has three root layouts — `(site)`, `(payload)`, `(print)` — so Next has no
 * single one to wrap this in and renders it inside a bare `<html><body>`:
 * no `lang`, no theme class, no `next/font` variables. `globals.css` is
 * imported here for exactly that case, so the page is at least in the design
 * system's colours; the Chinese is drawn in the reader's system face rather
 * than Noto Sans TC. A `notFound()` from a real route has none of that
 * problem — it renders inside whichever root layout matched, fonts, theme,
 * `lang="zh-Hant"` and all.
 *
 * `global-not-found.tsx` is the documented fix for the bare shell and it is
 * deliberately not used: it is experimental, it must reproduce the whole
 * `<html>` shell, and it changes routing in a way this repository cannot
 * check anywhere except a real Cloudflare deploy. An unstyled `lang` is a
 * smaller problem than an unverifiable one.
 *
 * NO `robots` DIRECTIVE HERE. Next injects `<meta name="robots"
 * content="noindex">` on any response carrying a 404 status — present in the
 * served HTML of every route measured above, before this file existed.
 */

/** Said twice on purpose: it is the page's own sentence and its description. */
const EXPLANATION =
  "這個網址上沒有東西。文章可能還沒發布，相簿可能換了名字，或者網址少了一段。";

export const metadata: Metadata = pageMetadata({
  title: "找不到這一頁",
  subtitle: EXPLANATION,
  card: { kind: "plain" },
});

const LINKS = [
  { href: "/", label: "回首頁", variant: "default" as const },
  { href: "/posts", label: "看文章", variant: "outline" as const },
  { href: "/gallery", label: "看相冊", variant: "outline" as const },
  { href: "/races", label: "看賽事", variant: "outline" as const },
];

export default function NotFound() {
  return (
    <div
      className="container flex max-w-3xl flex-col gap-6 py-16 lg:py-24"
      data-testid="not-found-page"
    >
      <p className="font-heading text-6xl font-extrabold leading-none tracking-tight text-muted-foreground lg:text-8xl">
        404
      </p>
      <h1 className="text-4xl font-extrabold tracking-tight text-foreground lg:text-5xl">
        找不到這一頁
      </h1>
      <p className="text-lg text-muted-foreground">{EXPLANATION}</p>
      <div className="flex flex-wrap gap-3">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(buttonVariants({ variant: link.variant }))}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
