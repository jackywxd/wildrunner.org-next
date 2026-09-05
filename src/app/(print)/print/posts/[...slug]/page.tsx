import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { PayloadRichText } from "@/components/payload-rich-text";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import { siteConfig } from "@/config/site";
import { getBylineAvatar, getPostBySlugParam } from "@/lib/content";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { postPublicPath } from "@/lib/content-paths";
import type { SiteImage } from "@/lib/content-types";
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
  // DEFAULT_LOCALE, because this route is outside `[lang]` and has no locale
  // to read: `/print/posts/…` is one address, reached from the article in
  // whichever language the reader was in. A printed sheet is a keepsake of
  // the article as its author wrote it, so it prints the stored Traditional.
  // Saying so here is the point of the required parameter — the alternative
  // is a default that quietly decides this on every route that forgets.
  const post = await getPostBySlugParam(
    (await params).slug.join("/"),
    DEFAULT_LOCALE,
  );
  return {
    robots: { follow: true, index: false },
    title: post?.title ?? siteConfig.title,
  };
}

/**
 * The byline, with the member's own face when they have set one.
 *
 * A COMPONENT BECAUSE THE PAGE RENDERS IT TWICE — magazine puts the byline
 * under a centred title block and the other two put it under a flush-left
 * one — and a byline that carries a picture in one place and not the other is
 * the kind of difference nobody notices until it is printed.
 *
 * `unoptimized` is deliberate: this is a 40px circle, so the optimiser would
 * cost a Worker round trip to save nothing, and Browser Rendering fetching
 * `/_next/image` for it is one more thing that can be slow at exactly the
 * wrong moment. Everything else on this page goes through the optimiser
 * because everything else on it is a photograph.
 */
function Byline({ avatar, name }: { avatar?: SiteImage; name: string }) {
  return (
    <span className="print-byline-inner">
      {avatar && (
        <Image
          alt=""
          className="print-avatar"
          height={40}
          src={avatar.src}
          unoptimized
          width={40}
        />
      )}
      <span>{name}</span>
    </span>
  );
}

export default async function PrintPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const slugParam = (await params).slug.join("/");
  const post = await getPostBySlugParam(slugParam, DEFAULT_LOCALE);
  if (!post) notFound();

  const { template, font } = parsePrintOptions(await searchParams);
  const photos = printsPhotos(template);

  // ASKED FOR ONLY WHEN THERE IS A BYLINE TO ASK ABOUT, and never on the
  // compact template — that one exists to spend the least paper, so a
  // decorative portrait is the first thing it should not fetch. `photos` is
  // the same flag that strips the article's own uploads.
  const avatar =
    photos && post.authorSlug
      ? await getBylineAvatar(post.authorSlug)
      : undefined;

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
            {post.author && (
              <p className="print-byline">
                <Byline avatar={avatar} name={post.author} />
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <h1 className="print-title" data-testid="print-title">
            {post.title}
          </h1>
          {post.author && (
            <p className="print-byline">
              <Byline avatar={avatar} name={post.author} />
            </p>
          )}
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
