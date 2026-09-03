import { NextResponse } from "next/server";

import { getPostBySlugParam } from "@/lib/content";
import { postPublicPath } from "@/lib/content-paths";
import { siteConfig } from "@/config/site";
import { contentDisposition, pdfFilename } from "@/lib/print/filename";
import { parsePrintOptions } from "@/lib/print/options";
import { renderPrintPdf } from "@/lib/print/render-pdf";

/**
 * The article as a file, rather than as a page somebody prints.
 *
 * IT RENDERS `/print/posts/<slug>` AND NOTHING ELSE, and that constraint is
 * the security of the whole endpoint. Browser Rendering will fetch any URL it
 * is handed, so an endpoint taking a `url` from the caller is an open browser
 * proxy on somebody else's bill — Cloudflare's own how-to says so in as many
 * words. This one accepts a slug and two enumerated menu values; the address
 * is then built here, from this request's own origin, and the origin is
 * checked against the hosts this app is ever served from before it is used.
 * There is no input that can point it somewhere else.
 *
 * THE POST IS RESOLVED FIRST, by the same `getPostBySlugParam` the print page
 * itself uses — which returns published posts only. So a draft, or a slug
 * nobody has, is a 404 here before any browser time is spent, and this
 * endpoint can never expose an article the print page would not.
 *
 * `force-dynamic` for the same reason `/api/gallery/wall` is: a cached
 * response keyed by path would outlive a withdrawn or edited article. The
 * caching that matters happens inside Browser Run instead, where it bounds
 * the cost rather than the correctness — see `render-pdf.ts`.
 */
export const dynamic = "force-dynamic";

/**
 * Where this app is ever served from.
 *
 * `wildrunner.org` and its `www` are the production routes in
 * `wrangler.jsonc`; everything else this deploys to — staging and every
 * preview — is a `workers.dev` subdomain. Localhost is here so the endpoint
 * behaves the same way in dev, where it gets as far as reporting that there
 * is no renderer.
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const requested = new URL(request.url);
  if (!isOwnOrigin(requested.hostname)) {
    return NextResponse.json({ error: "unknown origin" }, { status: 400 });
  }

  const slugParam = (await params).slug.join("/");
  const post = await getPostBySlugParam(slugParam);
  if (!post) {
    // Member-facing, because it is: the download button shows whatever this
    // says, and an article can be withdrawn between opening the print page
    // and pressing it.
    return NextResponse.json(
      { error: "找不到這篇文章，它可能已經下架。" },
      { status: 404 },
    );
  }

  const { template, font } = parsePrintOptions({
    template: requested.searchParams.get("template"),
    font: requested.searchParams.get("font"),
  });

  // Built from the resolved post's own slug rather than from what was typed,
  // so `posts/2024/utmb` and `2024/utmb` — both of which address the article —
  // render the one canonical page.
  const target = new URL(
    `/print/posts/${post.slug.replace(/^posts\//, "")}`,
    requested.origin,
  );
  target.searchParams.set("template", template);
  target.searchParams.set("font", font);

  // The address a reader finds the article at, printed at the foot of every
  // sheet — the canonical origin, never `target`'s, which on staging or a
  // preview is a workers.dev name nobody can type back in.
  const rendered = await renderPrintPdf(
    target.toString(),
    `${siteConfig.baseURL}${postPublicPath(post.slug)}`,
  );

  if (!rendered.ok) {
    // 503 for "not here", 502 for "here and it went wrong" — the first is
    // permanent for this environment and the member should be told to use the
    // print button instead; the second is worth trying again.
    const { message, status } =
      rendered.reason === "no-browser"
        ? {
            message: "這個環境沒有 PDF 產生服務，請用「列印 / 存成 PDF」。",
            status: 503,
          }
        : { message: "PDF 產生失敗，請稍後再試。", status: 502 };
    return NextResponse.json({ error: message }, { status });
  }

  return new Response(rendered.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(pdfFilename(post.title)),
      // The article can change; a browser holding yesterday's file would have
      // no way to know. Browser Run's own hour is where the cost is bounded.
      "Cache-Control": "no-store",
    },
  });
}
