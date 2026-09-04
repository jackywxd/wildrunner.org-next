import { NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { getRiderTimeline } from "@/lib/content";
import { pdfDownloadResponse } from "@/lib/print/pdf-response";

/**
 * 穿越時光 as a file — the same rail the print button prints, as a PDF.
 *
 * IT RENDERS THE LIVE PAGE, not a `/print/...` twin, and that is the whole
 * difference from the article's endpoint. `/riders/<slug>/timeline` is
 * already styled for paper: `globals.css`'s `@media print` block drops the
 * site header, footer and the rail's fill, and forces the reveal states open
 * so a row nobody scrolled to still prints. Browser Rendering renders with
 * print media, so it gets that sheet — a second layout for the same rail
 * would be two things to keep in step for no gain.
 *
 * ONLY THE PER-MEMBER TIMELINE HAS THIS, and the club rail deliberately does
 * not. That page is an infinite scroll: the server sends page one and the
 * browser fetches the rest, so a server-side render would produce a PDF
 * silently missing everything past the first page. Its own print button
 * exists precisely because it can load the rest first (`ClubTimelineFeed`'s
 * `printAll`), which nothing outside a browser can do. A truncated PDF that
 * looks complete is worse than no download.
 *
 * `force-dynamic`, matching the page itself: a member who just logged a race
 * expects it in the file.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  // The same lookup the page runs, so this can never render a timeline the
  // page would not — and it costs no browser time when there is none.
  const found = await getRiderTimeline(slug);
  if (!found) {
    return NextResponse.json(
      { error: "找不到這位跑者的穿越時光。" },
      { status: 404 },
    );
  }

  return pdfDownloadResponse({
    requestUrl: request.url,
    path: `/riders/${found.rider.slug}/timeline`,
    canonical: `${siteConfig.baseURL}/riders/${found.rider.slug}/timeline`,
    title: `${found.rider.name} 的穿越時光`,
  });
}
