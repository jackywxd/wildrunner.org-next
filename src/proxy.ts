import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_LOCALE, LOCALE_SEGMENTS } from "@/lib/i18n/locales";

/**
 * Puts a language on every request that reaches the site's pages, without
 * putting one in any address a person has.
 *
 * WHY A REWRITE AND NOT A REDIRECT. Every URL this site has ever published
 * is unprefixed: the articles in the index, the share cards whose `og:url`
 * is already printed into images sitting in other people's chat histories,
 * the PDFs with the article's address in their running footer. Redirecting
 * `/` to `/zh-hant` would work and would also invalidate all of that at
 * once. A rewrite is invisible from outside — `/posts/2024/utmb` stays
 * `/posts/2024/utmb` in the bar, in a crawler's index and on paper — while
 * `app/[lang]/(site)` sees `/zh-hant/posts/2024/utmb` and can be told which
 * language it is rendering.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH:
 *
 *   `/api`     Payload's REST and GraphQL live here (`(payload)/api`), and
 *              so do this app's own handlers (`app/api/print`, `/gallery/wall`,
 *              `/riders/timeline`). None of them renders a page.
 *   `/admin`   Payload's, under its own root layout. A dynamic segment at
 *              the app root must never start deciding what `/admin` means.
 *   `/print`   A third root layout, reached by machine — Browser Rendering
 *              fetches it to make the PDF.
 *   `/_next`, and anything with a file extension: assets.
 *
 * NO `Accept-Language` SNIFFING, and that is a decision rather than an
 * omission. Sending a reader to a language because of the header their
 * laptop happens to send is how a Chinese reader in Vancouver — which is
 * most of this club — lands on an English page they did not ask for. The
 * site answers in the language it is written in and offers a way to change
 * it; the choice is then the reader's and it is remembered.
 */
const SKIP = ["/api", "/admin", "/print", "/_next"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (SKIP.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return;
  }
  // `/icon.svg`, `/fonts/Inter-Regular.ttf`, `/favicon.ico` — served from
  // `public/` by Workers Assets, and a language in front of them is a 404.
  if (pathname.includes(".")) return;

  const [, first] = pathname.split("/");
  if (LOCALE_SEGMENTS.includes(first)) return;

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except Next's own internals. The prefixes above are checked
  // in the function as well, and on purpose: this matcher is one regex that
  // is easy to get subtly wrong, and the list up there is the one a reader
  // will find when they ask why `/admin` is exempt.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
