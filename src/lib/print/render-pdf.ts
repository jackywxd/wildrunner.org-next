import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * A real PDF of the print page, rendered by Cloudflare Browser Rendering.
 *
 * WHY A SERVICE AND NOT `window.print()`. The toolbar's button already gets a
 * member a PDF through Chrome's own dialog, and that stays — this is the path
 * for everything that dialog cannot do. Two things in particular:
 *
 *   - **Page numbers.** `print.css` records at length that Chrome does not
 *     implement the `@page` margin boxes a running footer needs, so the page
 *     the visitor prints genuinely cannot carry "3 / 9". Puppeteer's
 *     `footerTemplate` can, and this is the only way to reach it.
 *   - **A file that is named.** A dialog print is named by whatever the
 *     browser decides; this response carries a `Content-Disposition`.
 *
 * THE BINDING, NOT THE REST API, and that is not a style preference: the REST
 * form needs an account id and an API token as runtime Worker secrets, and a
 * token that can drive a browser is a thing somebody then has to store,
 * rotate and keep out of a public repository. `env.BROWSER.quickAction()`
 * needs neither — it is one line in `wrangler.jsonc` and the Worker talks to
 * Browser Run over Cloudflare's own network. It requires a compatibility date
 * of 2026-03-24 or later; this app is on 2026-07-27.
 *
 * IT IS ABSENT EVERYWHERE EXCEPT A DEPLOY, exactly like the transcoder, so
 * this returns a reason rather than throwing — see `poster-dispatch.ts` for
 * the shape and why a member has to be told rather than left watching a
 * button that does nothing. Miniflare *does* provide a local `BROWSER`
 * binding, but only the session/CDP routes `@cloudflare/puppeteer` uses; it
 * has no `quickAction`, and says so in the error the Cloudflare docs quote.
 * Matching that string is what keeps `pnpm dev` and CI reporting "this
 * environment has no renderer" instead of "the render failed".
 *
 * ABOUT FONTS, because this is where that question was parked. The print
 * layout loads Noto Sans TC and Noto Serif TC through `next/font/google`,
 * which downloads them at build and serves them from our own origin. Browser
 * Run fetches the page over the public internet like any browser, so it gets
 * the same font files a visitor does — there is nothing for an R2 copy of the
 * font to fix. `networkidle0` below is what makes sure they
 * have arrived before the snapshot is taken.
 */
export type PdfRenderResult =
  | { ok: true; body: ReadableStream<Uint8Array> }
  | { ok: false; reason: "no-browser" | "rejected" | "failed" };

/**
 * The running footer, which is the one thing the print dialog cannot produce.
 *
 * IT CARRIES THE ARTICLE'S OWN ADDRESS ON EVERY SHEET, not only the page
 * number. `print.css` already ends the document with a static block naming the
 * URL — that is all the browser's own print path can manage — but a sheet
 * separated from the other 40 has no way back to the article, and that is
 * exactly the sheet somebody keeps. A running footer is what a real PDF
 * renderer can do and a stylesheet cannot: Chrome does not implement the
 * `@page` margin boxes CSS would need.
 *
 * Chrome renders this inside the `@page` margin, which `print.css` sets to
 * 22mm — room for a line of 8px text without touching the body. The header
 * template has to be supplied even though it is empty: with
 * `displayHeaderFooter` on and no template, Chrome prints its own title-and-
 * date header, which is not this design.
 *
 * The URL is escaped although it is built from our own slug and origin — the
 * template is HTML, and a value interpolated into HTML is escaped where it is
 * interpolated, not where somebody remembers to.
 */
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] as string,
  );

const footerTemplate = (canonical: string) =>
  `<div style="width:100%;margin:0 20mm;font-size:8px;color:#7a756f;font-family:sans-serif;display:flex;justify-content:space-between;">
  <span>${escapeHtml(canonical)}</span>
  <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`;

export async function renderPrintPdf(
  url: string,
  /** The article's public address, printed at the foot of every sheet. */
  canonical: string,
): Promise<PdfRenderResult> {
  const { env } = await getCloudflareContext({ async: true });
  const browser = (env as unknown as { BROWSER?: BrowserRun }).BROWSER;
  if (!browser) return { ok: false, reason: "no-browser" };

  try {
    const response = await browser.quickAction("pdf", {
      url,
      gotoOptions: { waitUntil: "networkidle0", timeout: 30_000 },
      // A straggling request must not cost the whole render: the page is
      // already complete by then, and a PDF with one photograph missing beats
      // an error.
      bestAttempt: true,
      // THE COST CONTROL, and the reason it is enough. This endpoint is public
      // because the article is, and browser time is metered — but the route
      // builds the URL it renders from the slug and two enumerated menus, so
      // the whole address space is six PDFs per article. An hour of caching
      // therefore bounds what any amount of traffic can spend, and it costs
      // an edit up to an hour to show up in the download — the same window
      // the article's own cache already has.
      cacheTTL: 3600,
      pdfOptions: {
        // `print.css` sets `@page { size: A4; margin: 22mm 20mm }`, and every
        // measurement in that file — the 190mm cap that stops a portrait
        // photograph taking a sheet of its own — is against those numbers.
        // Without this Chrome would use its own Letter default and quietly
        // invalidate all of them.
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: footerTemplate(canonical),
      },
    });

    if (!response.ok) {
      // Read rather than reported blind: Browser Run answers a refusal with
      // its own JSON, and that message is the difference between "the page
      // 404'd" and "the account is over its limit".
      const detail = await response.text().catch(() => "");
      console.warn(
        `browser rendering refused ${url}: ${response.status} ${detail.slice(0, 300)}`,
      );
      return { ok: false, reason: "rejected" };
    }

    if (!response.body) return { ok: false, reason: "failed" };
    return { ok: true, body: response.body };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The local binding's own words. Documented on Cloudflare's Quick Actions
    // page as what you get without remote mode, and it is not a failure of
    // this render — it is the absence of a renderer.
    if (/does not implement the method/i.test(message)) {
      return { ok: false, reason: "no-browser" };
    }
    console.warn(`browser rendering failed for ${url}: ${message}`);
    return { ok: false, reason: "failed" };
  }
}
