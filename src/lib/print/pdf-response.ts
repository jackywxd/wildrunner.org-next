import { NextResponse } from "next/server";

import { contentDisposition, pdfFilename } from "@/lib/print/filename";
import { renderPrintPdf } from "@/lib/print/render-pdf";

/**
 * "Render one of our own pages and hand it back as a named PDF file."
 *
 * SHARED BY EVERY PDF ENDPOINT, and the sharing is not about line count. Each
 * of the three things this does is a decision that must not be made twice:
 *
 *   - **The URL is built here, from a path this app chose.** Browser
 *     Rendering fetches whatever URL it is handed, so an endpoint that took
 *     one from its caller would be an open browser proxy on somebody else's
 *     bill — Cloudflare's own how-to says so in as many words. A caller
 *     passes a `path`; there is no input that reaches this as an origin.
 *   - **The origin is checked** against the hosts this app is ever served
 *     from, before it is used.
 *   - **A failure keeps its meaning.** 503 is "no renderer in this
 *     environment", which is permanent here and means the reader should use
 *     the browser's print command instead; 502 is "there is one and it went
 *     wrong", which is worth pressing again. A second copy of that mapping
 *     would eventually collapse both into 500.
 *
 * What it deliberately does NOT do is resolve anything. Whether the thing
 * being printed exists, and whether this caller may see it, is the route's
 * own business — and it must be settled before this is called, so no browser
 * time is spent on a page that will 404.
 */
export async function pdfDownloadResponse({
  requestUrl,
  path,
  canonical,
  title,
}: {
  /** `request.url`, from which the origin to render against is taken. */
  requestUrl: string;
  /** Absolute path on this site, query string included, to render. */
  path: string;
  /** Where a reader finds this thing — printed at the foot of every sheet. */
  canonical: string;
  /** Names the file. Sanitised and encoded by `filename.ts`. */
  title: string;
}): Promise<Response> {
  const requested = new URL(requestUrl);
  if (!isOwnOrigin(requested.hostname)) {
    return NextResponse.json({ error: "unknown origin" }, { status: 400 });
  }

  const rendered = await renderPrintPdf(
    new URL(path, requested.origin).toString(),
    canonical,
  );

  if (!rendered.ok) {
    const { message, status } =
      rendered.reason === "no-browser"
        ? {
            message: "這個環境沒有 PDF 產生服務，請用瀏覽器的「列印」。",
            status: 503,
          }
        : { message: "PDF 產生失敗，請稍後再試。", status: 502 };
    return NextResponse.json({ error: message }, { status });
  }

  return new Response(rendered.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(pdfFilename(title)),
      // What is being printed can change; a browser holding yesterday's file
      // would have no way to know. Browser Run's own hour, which
      // `render-pdf.ts` sets, is where the cost is bounded instead.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Where this app is ever served from.
 *
 * `wildrunner.org` and its `www` are the production routes in
 * `wrangler.jsonc`; everything else this deploys to — staging and every
 * preview — is a `workers.dev` subdomain. Localhost is here so these
 * endpoints behave the same way in dev, where they get as far as reporting
 * that there is no renderer.
 *
 * A `Host` an attacker chose should not reach this Worker at all, since
 * Cloudflare routes by it; this is the second lock, not the first.
 */
function isOwnOrigin(hostname: string): boolean {
  return (
    hostname === "wildrunner.org" ||
    hostname === "www.wildrunner.org" ||
    hostname.endsWith(".workers.dev") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  );
}
