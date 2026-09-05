import { NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { getPostBySlugParam } from "@/lib/content";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { postPublicPath } from "@/lib/content-paths";
import { parsePrintOptions } from "@/lib/print/options";
import { pdfDownloadResponse } from "@/lib/print/pdf-response";

/**
 * The article as a file, rather than as a page somebody prints.
 *
 * WHAT THIS ROUTE ITSELF DECIDES is only what to render: the article exists,
 * these are its two menu values, this is the page. Everything after that —
 * building the URL from our own origin, rendering it, naming the file, and
 * what a failure means — is `pdfDownloadResponse`, shared with the timeline's
 * endpoint. See that file for why each of those must not be decided twice.
 *
 * THE POST IS RESOLVED FIRST, by the same `getPostBySlugParam` the print page
 * itself uses — which returns published posts only. So a draft, or a slug
 * nobody has, is a 404 here before any browser time is spent, and this
 * endpoint can never expose an article the print page would not.
 *
 * `force-dynamic` for the same reason `/api/gallery/wall` is: a cached
 * response keyed by path would outlive a withdrawn or edited article.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const slugParam = (await params).slug.join("/");
  // The same Traditional the print page renders — this route asks Browser
  // Rendering to print that page, so a different language here would put the
  // PDF and the page it claims to be a copy of in two scripts.
  const post = await getPostBySlugParam(slugParam, DEFAULT_LOCALE);
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
    template: new URL(request.url).searchParams.get("template"),
    font: new URL(request.url).searchParams.get("font"),
  });

  // Built from the resolved post's own slug rather than from what was typed,
  // so `posts/2024/utmb` and `2024/utmb` — both of which address the article —
  // render the one canonical page.
  const path = `/print/posts/${post.slug.replace(/^posts\//, "")}?template=${template}&font=${font}`;

  return pdfDownloadResponse({
    requestUrl: request.url,
    path,
    // The canonical origin, never the request's — on staging or a preview
    // that is a workers.dev name nobody can type back in.
    canonical: `${siteConfig.baseURL}${postPublicPath(post.slug)}`,
    title: post.title,
  });
}
