import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { PayloadRichText } from "@/components/payload-rich-text";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import { siteConfig } from "@/config/site";
import { getPostBySlugParam } from "@/lib/content";
import { postPublicPath } from "@/lib/content-paths";
import {
  parsePrintOptions,
  printsPhotos,
  withoutUploads,
} from "@/lib/print/options";
import { formatDate } from "@/lib/utils";

/**
 * One article, laid out for paper.
 *
 * A ROUTE OF ITS OWN rather than `?print=1` on the article, because it cannot
 * be nested under it: `/posts/[...slug]` is a catch-all, so `/posts/a/b/print`
 * is the slug `["a","b","print"]` and a child segment is unreachable. Living
 * outside `(site)` is what gets it a page with no navigation — see this
 * group's layout.
 *
 * It is also the foundation for the download that is not built yet. Browser
 * Rendering's `/pdf` endpoint renders a URL; this is the URL it will render,
 * so the templates below are the templates a real PDF gets. Nothing about the
 * layout has to change when that lands.
 *
 * `noindex`: three templates times two faces is six addresses for one article,
 * and none of them should compete with the article itself in a search result.
 */
export const metadata: Metadata = { robots: { follow: true, index: false } };

export default async function PrintPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const slugParam = (await params).slug.join("/");
  const post = await getPostBySlugParam(slugParam);
  if (!post) notFound();

  const { template, font } = parsePrintOptions(await searchParams);
  const photos = printsPhotos(template);

  // Stripped on the SERVER, so a compact print never asks for the images it
  // will not show — `withoutUploads` explains why `display: none` is not the
  // same thing.
  const body = photos ? post.content : withoutUploads(post.content);

  const canonical = `${siteConfig.baseURL}${postPublicPath(post.slug)}`;

  return (
    <main
      className={[
        "print-root",
        `print-${template}`,
        template === "compact" ? "print-compact-page" : "",
        font === "serif" ? "print-font-serif" : "",
        "mx-auto max-w-[46rem] px-6 py-8",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="print-page"
      data-template={template}
      data-font={font}
    >
      {/* `useSearchParams` needs a boundary; the toolbar is the only client
          component on the page and everything else is already rendered. */}
      <Suspense fallback={null}>
        <PrintToolbar template={template} font={font} />
      </Suspense>

      <header className="print-head">
        <span className="print-mark">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <circle
              cx="6"
              cy="6"
              r="5.2"
              fill="none"
              stroke="#8A3FFA"
              strokeWidth="1.6"
            />
          </svg>
          野馬營
        </span>
        {post.date && <span>{formatDate(post.date)}</span>}
      </header>

      {template === "magazine" ? (
        <>
          {photos && post.image && (
            <div className="print-cover">
              <Image
                src={post.image.src}
                alt={post.title}
                width={post.image.width}
                height={post.image.height}
                sizes="46rem"
                priority
              />
            </div>
          )}
          <div className="print-titleblock">
            {/* Only a race report is a 賽記; anything else would be a label
                asserting something the post does not say. */}
            {post.race && <p className="print-kicker">賽記</p>}
            <h1 className="print-title" data-testid="print-title">
              {post.title}
            </h1>
            {post.author && <p className="print-byline">{post.author}</p>}
          </div>
        </>
      ) : (
        <>
          <h1 className="print-title" data-testid="print-title">
            {post.title}
          </h1>
          {post.author && <p className="print-byline">{post.author}</p>}
          {photos && post.image && (
            <div className="print-cover">
              <Image
                src={post.image.src}
                alt={post.title}
                width={post.image.width}
                height={post.image.height}
                sizes="46rem"
                priority
              />
            </div>
          )}
        </>
      )}

      {body && <PayloadRichText data={body} className="print-body" />}

      {/*
        One block at the end, not a running footer — Chrome does not implement
        the `@page` margin boxes a running one would need. What it is for is
        the sheet that gets separated from the rest: this is how somebody finds
        the article again.
      */}
      <footer className="print-foot" data-testid="print-foot">
        <span>{siteConfig.title}</span>
        <span>{canonical}</span>
      </footer>
    </main>
  );
}
