import type { Metadata } from "next";
import localFont from "next/font/local";

import { Archivo, Noto_Sans_SC, Noto_Sans_TC } from "next/font/google";
import "@/styles/globals.css";
import { ReactNode } from "react";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import Providers from "./providers";
import { getSiteBaseURL, siteConfig } from "@/config/site";
import { LOCALES, isLocaleSegment, localeTag } from "@/lib/i18n/locales";
import { localiseText } from "@/lib/i18n/to-simplified";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  weight: ["400", "600", "800"],
});

/**
 * One CJK face per script, both bound to `--font-noto`.
 *
 * WHY TWO FILES AND NOT ONE. Traditional and Simplified share most of their
 * code points and draw a number of them differently — 骨, 直, 令 and their
 * relatives have different strokes in the two conventions — so serving TC
 * glyphs on a Simplified page is the same class of mistake as the `<html
 * lang="en">` this layout's own comment below records: legible, wrong, and
 * invisible to anyone who does not read the script.
 *
 * The variable name is shared on purpose. `globals.css` composes
 * `--font-body: var(--font-archivo), var(--font-noto), …` once, and the
 * layout decides which face that name resolves to by putting exactly one of
 * these classes on `<html>`. Nothing downstream has to know there are two.
 */
const notoSansTc = Noto_Sans_TC({
  subsets: ["latin"],
  variable: "--font-noto",
});

const notoSansSc = Noto_Sans_SC({
  subsets: ["latin"],
  variable: "--font-noto",
});

/**
 * THE SITE NAME IS APPENDED HERE AND NOWHERE ELSE.
 *
 * This template used to read `%s | Wild Runner Website` while every route
 * also appended `| 野馬營` of its own, so a tab read
 * 「賽事日程 | Race Schedule | 野馬營 | Wild Runner Website」 — four segments,
 * two site names, and the outer one in a language the site is not written in.
 * Routes now return the bare subject (see `pageMetadata`) and this adds the
 * name once.
 *
 * The full-width 「｜」 is the CJK separator: at this type size the half-width
 * one crowds the characters on either side of it. It is also not the
 * character `/og` splits a legacy `title|author` on, which is one fewer way
 * for a title to end up in a card's byline.
 */
/**
 * `generateMetadata` rather than a static `metadata`, so the site name in the
 * template is in the same script as the page it is appended to.
 *
 * `siteConfig.title` is 野馬營, written once and not in any dictionary. That
 * was invisible while every page was Traditional. The moment articles started
 * being converted it became the tab title 「芝加哥马拉松｜野馬營」 — two
 * scripts in one string, in the one string a search result and a chat preview
 * both show. A static export cannot see `lang`, so it could not have been
 * fixed where it is composed.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const name = localiseText(siteConfig.title, lang);
  return {
    metadataBase: new URL(getSiteBaseURL()),
    title: {
      template: `%s｜${name}`,
      default: name,
    },
    description: localiseText(siteConfig.description, lang),
  };
}

const fontCode = localFont({
  // Three levels, not two: this file sits under `[lang]/(site)/` now.
  src: "../../../assets/fonts/GeistMonoVF.woff2",
  variable: "--font-code",
});

/**
 * The languages this layout is the root of.
 *
 * One entry today. It is here rather than left implicit because a root
 * parameter with no `generateStaticParams` is a route Next cannot enumerate,
 * and `LOCALES` is the single list every other part of the three-language
 * work reads — the segment, the `<html lang>` tag and, later, `hreflang` all
 * come from it, so they cannot drift apart.
 */
export function generateStaticParams() {
  return LOCALES.map(({ segment }) => ({ lang: segment }));
}

export default async function SiteLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;
  // A language this site is not published in is not a page.
  //
  // `[lang]` is one dynamic segment, so it matches anything: `/en/posts`
  // would otherwise render the Traditional Chinese article under an address
  // claiming to be English, and every unpublished language would quietly
  // become a duplicate of the whole site. The rewrites in `next.config.ts`
  // cannot refuse it — they only add a prefix where one is missing — so the
  // refusal belongs here, where the list of languages actually lives.
  if (!isLocaleSegment(lang)) notFound();

  return (
    <html
      // The site is written in Traditional Chinese and said it was English.
      // That is not only a metadata detail: `lang` is what a screen reader
      // picks a voice from, what a search engine indexes the page as, and —
      // the reason it surfaced here — one of the signals a browser uses to
      // choose a CJK fallback face, so a page declaring `en` can be rendered
      // with Japanese or Simplified glyph forms for characters the two
      // scripts share.
      //
      // `zh-Hant` rather than `zh-TW`: the script is what is true of this
      // site. Its readers are a Vancouver club, not a region.
      //
      // The admin panel is not covered here and does not need to be —
      // Payload's own `RootLayout` renders `<html lang={languageCode}>` for
      // it (see src/app/(payload)/layout.tsx, where a hand-written wrapper
      // that pinned it to "en" once broke hydration on every admin page).
      //
      // It comes from the route now rather than from this line. `localeTag`
      // maps the URL segment people type (`zh-hant`) to the tag a browser
      // reads (`zh-Hant`); anything it does not recognise has already been
      // refused above, so its fallback is a belt rather than a decision.
      lang={localeTag(lang)}
      suppressHydrationWarning
      /*
        The next/font variable classes belong here, not on <body>.
        `globals.css` composes them on `:root` —
        `--font-heading: var(--font-archivo), ...` — and a custom property
        that references one which is not defined at that element resolves to
        nothing at all. With these classes on <body>, `--font-archivo` did
        not exist on <html>, so `--font-heading` and `--font-body` were both
        empty, every rule reading them was invalid at computed-value time,
        and the whole design system's typography silently fell through to
        Tailwind's default sans stack. Measured before the move: `<h1>` and
        `<p>` on /about both computed to
        `ui-sans-serif, system-ui, sans-serif, …` — neither Archivo nor Noto
        Sans TC was used anywhere on the site, though both were downloaded on
        every page.
      */
      className={cn(
        archivo.variable,
        lang === "zh-hans" ? notoSansSc.variable : notoSansTc.variable,
        fontCode.variable,
      )}
    >
      <head>
        {/*
          esbuild's `keepNames` shim, defined before anything can need it.

          next-themes builds its anti-FOUC script by serialising a function —
          `(${script.toString()})(...)`. The published package contains no
          `__name`, but the Cloudflare Worker bundler re-bundles it with
          esbuild's `keepNames`, which rewrites that function body to call
          `__name(fn, "fn")`. The helper only ever exists in the bundle's own
          scope, never in the browser, so the inlined copy threw
          "__name is not defined" on every page and next-themes never got to
          apply the theme class.

          It stayed hidden while I18nProvider blocked SSR: ThemeProvider sits
          inside it, so the script was never in the delivered HTML. Restoring
          server rendering (62040dc) put it there and the error surfaced.

          Mirrors esbuild's own helper — set `.name`, return the target — so
          the serialised code behaves exactly as it does inside the bundle.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__name||(window.__name=function(t,v){try{Object.defineProperty(t,"name",{value:v,configurable:true})}catch(e){}return t});`,
          }}
        />
        {/* Avoid FOUC: seed theme from localStorage, else browser light → light, otherwise dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='wildrunner-theme';var t=localStorage.getItem(k);if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';localStorage.setItem(k,t);}var r=document.documentElement;if(t==='dark'){r.classList.add('dark');}else{r.classList.remove('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased font-lexend bg-background">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
