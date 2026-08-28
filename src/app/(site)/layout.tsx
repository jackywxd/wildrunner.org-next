import type { Metadata } from "next";
import localFont from "next/font/local";

import { Archivo, Noto_Sans_TC } from "next/font/google";
import "@/styles/globals.css";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import Providers from "./providers";
import { getSiteBaseURL } from "@/config/site";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  weight: ["400", "600", "800"],
});

const notoSansTc = Noto_Sans_TC({
  subsets: ["latin"],
  variable: "--font-noto",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteBaseURL()),
  title: {
    template: "%s | Wild Runner Website",
    default: "Wild Runner",
  },
};

const fontCode = localFont({
  src: "../../assets/fonts/GeistMonoVF.woff2",
  variable: "--font-code",
});

export default function SiteLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
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
      className={cn(archivo.variable, notoSansTc.variable, fontCode.variable)}
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
