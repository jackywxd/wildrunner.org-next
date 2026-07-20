import type { Metadata } from "next";
import localFont from "next/font/local";
import NextTopLoader from "nextjs-toploader";

import { Lexend } from "next/font/google";
import "@/styles/globals.css";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import App from "@/components/app";
import Providers from "./providers";
import PageTransitionEffect from "@/components/transition/PageTransitionEffect";
import { TailwindIndicator } from "@/components/tailwind-indicator";

const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend" });

export const metadata: Metadata = {
  title: {
    template: "%s | Wild Runner Website",
    default: "Wild Runner",
  },
};

const fontCode = localFont({
  src: "../assets/fonts/GeistMonoVF.woff2",
  variable: "--font-code",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={cn(
          "min-h-screen antialiased font-lexend bg-background",
          lexend.variable,
          fontCode.variable
        )}
      >
        <Providers>
          <App>
            <NextTopLoader showSpinner={false} />
            <PageTransitionEffect>{children}</PageTransitionEffect>
            <TailwindIndicator />
          </App>
        </Providers>
      </body>
    </html>
  );
}
