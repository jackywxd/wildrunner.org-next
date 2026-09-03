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
 * It is also what the PDF download renders. Browser Rendering's `/pdf` action
 * takes a URL, and `/api/print/posts/<slug>` hands it this one — so these are
 * the templates a real PDF gets, and there is one layout rather than two that
 * drift. The only difference on paper is the running footer, which that route
 * supplies because CSS cannot.
 *
 * `noindex`: three templates times two faces is six addresses for one article,
 * and none of them should compete with the article itself in a search result.
 */
/**
 * THE TITLE IS THE FILENAME, which is the only reason this is `generateMetadata`
 * rather than a constant. Chrome's "Save as PDF" names the file after
 * `document.title`, and with no title the browser fell back to the URL: the
 * first real print off this page arrived as
 * `wildrunner.org_print_posts_untitled…pdf`. The download endpoint sets its
 * own name in `Content-Disposition`; this is what `window.print()` gets.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const post = await getPostBySlugParam((await params).slug.join("/"));
  return {
    robots: { follow: true, index: false },
    title: post?.title ?? siteConfig.title,
  };
}

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
        {/* The club's own mark, the same file `SiteLogo` uses. A hand-drawn
            circle stood here first and printed as a purple ring that is not
            this brand — the real mark is a filled square with a horse in it. */}
        <span className="print-mark">
          <Image
            src="/static/brand/mark-purple.svg"
            alt=""
            width={16}
            height={16}
            className="print-logo"
          />
          {siteConfig.title}
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
