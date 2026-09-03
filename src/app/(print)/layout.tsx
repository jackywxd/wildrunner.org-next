import type { ReactNode } from "react";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";

import "@/styles/print.css";

/**
 * A second root layout, for pages that exist to become paper.
 *
 * NO SITE CHROME AT ALL — no header, no navigation, no footer, no theme
 * toggle. A printed article should not carry a menu the reader cannot press,
 * and stripping that in `@media print` would still leave it on screen while
 * they choose a template. `(payload)` is already a second root layout in this
 * app for the same kind of reason, so this is the third `<html>` rather than a
 * new idea.
 *
 * `lang="zh-Hant"` for the reason `(site)/layout.tsx` records at length: it is
 * one of the signals a browser uses to pick a CJK face, so a page declaring
 * `en` can be rendered with Japanese or Simplified glyph forms for characters
 * the scripts share — which on paper is permanent.
 *
 * BOTH FACES ARE LOADED HERE, not linked from Google at runtime. `next/font/
 * google` downloads them at build and serves them from our own origin
 * (`/_next/static/media/`), which is what makes the serif option cost the same
 * privacy as the sans one already does site-wide. It is also why the R2 copy
 * of Noto Sans TC is not needed yet: nothing here reaches a third party. When
 * Browser Rendering lands, headless Chrome is the case that may need its own
 * font, and that is where to solve it.
 */
const notoSans = Noto_Sans_TC({
  subsets: ["latin"],
  variable: "--font-noto",
});

const notoSerif = Noto_Serif_TC({
  subsets: ["latin"],
  variable: "--font-noto-serif",
});

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="zh-Hant"
      className={`${notoSans.variable} ${notoSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
