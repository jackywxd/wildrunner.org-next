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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Avoid FOUC: seed theme from localStorage, else browser light → light, otherwise dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='wildrunner-theme';var t=localStorage.getItem(k);if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';localStorage.setItem(k,t);}var r=document.documentElement;if(t==='dark'){r.classList.add('dark');}else{r.classList.remove('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body
        className={cn(
          "min-h-screen antialiased font-lexend bg-background",
          archivo.variable,
          notoSansTc.variable,
          fontCode.variable
        )}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
