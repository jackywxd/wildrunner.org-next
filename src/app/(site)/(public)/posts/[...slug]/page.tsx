import React from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { cn, formatDate } from "@/lib/utils";
import "@/styles/mdx.css";

import Image from "next/image";
import { siteConfig } from "@/config/site";
import { ArticleReader } from "@/components/posts/ArticleReader";
import { PayloadRichText } from "@/components/payload-rich-text";
import { ChevronLeft, Printer } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getBylineAvatar, getPostBySlugParam, getPublishedPostSlugs } from "@/lib/content";
import { RiderAvatar } from "@/components/riders/RiderAvatar";
import { postPublicPath } from "@/lib/content-paths";
import { resolvePostOgCard } from "@/lib/postOg";
import { pageMetadata } from "@/lib/site-metadata";
import { RaceBadge } from "@/lib/races/badge";
import {
  resolveBadge,
  resolveBadgeDistance,
  resolveBadgeEvent,
} from "@/lib/races/badge-source";
import { catalogueMap, getRaceCatalogueEvents } from "@/lib/races/catalogue-db";

interface BlogPageItemProps {
  params: Promise<{
    slug: string[];
  }>;
}

export async function generateMetadata({
  params,
}: BlogPageItemProps): Promise<Metadata> {
  const slugParam = (await params).slug.join("/");
  const post = await getPostBySlugParam(slugParam);
  if (!post) return {};

  return pageMetadata({
    path: postPublicPath(post.slug),
    title: post.title,
    // The byline is the card's, and the description is the article's own
    // summary — two different sentences, so the card is signed by a person
    // while the crawler still gets what the piece is about.
    subtitle: post.description || (post.author ?? siteConfig.author),
    type: "article",
    // Cover image, else the first picture in the body, else a card seeded on
    // the slug. The middle rung matters because nothing in the members area
    // sets the cover field — see src/lib/postOg.ts.
    card: resolvePostOgCard(post),
  });
}

/**
 * The published posts, prerendered at build time.
 *
 * KEPT, unlike `/gallery/[slug]`'s. AGENTS.md's rule is that a route which is
 * `force-dynamic` must not export this — Next asks anyway, in a forked child,
 * and throws the answer away. This route is not force-dynamic and the answer
 * is not thrown away: every published post is prerendered, served from the R2
 * incremental cache, and invalidated per-slug by `revalidatePosts` when the
 * post changes (open-next.config.ts wires the D1 tag cache that makes that
 * work). Forcing this route dynamic to quiet the dev log would throw all of
 * that away and put a D1 query in front of every first view of an article.
 *
 * THE DEV SHORT-CIRCUIT IS THE POINT. Next's own docs: "During `next dev`,
 * `generateStaticParams` will be called when you navigate to a route"
 * (node_modules/next/dist/docs/.../generate-static-params.md). Dev renders
 * every path on demand whatever this returns, so in dev the answer is unused
 * — but producing it is not free. It runs in the `getStaticPathsWorker` fork,
 * whose global scope is empty, so payload.config.ts finds no parked
 * Cloudflare context and builds a *second* miniflare over the same local
 * SQLite file the dev server is serving from, then runs a full
 * `getPublishedPosts()` through it.
 *
 * Measured on the first navigation to this route on a warm dev server:
 * `generate-params: 5.2s`, and a second `workerd` appears alongside the dev
 * server's own for the duration. That is the same shape as the
 * `database is locked` AGENTS.md traces to this fork — two workerd contending
 * for one file — and the same waste `/gallery/[slug]` was paying at 2.1s.
 *
 * `next build` sets NODE_ENV=production, so the build still gets the real
 * list; nothing about what ships changes.
 */
export async function generateStaticParams() {
  if (process.env.NODE_ENV !== "production") return [];
  const slugs = await getPublishedPostSlugs();
  return slugs.map((slug) => ({
    slug: slug.split("/"),
  }));
}

export default async function BlogPageItem({ params }: BlogPageItemProps) {
  const slugParam = (await params).slug.join("/");
  const blog = await getPostBySlugParam(slugParam);
  if (!blog) {
    notFound();
  }
  // `React.cache`'d, so fetching it here costs nothing extra on a page that
  // also renders `RiderBadgeRow`/`RiderBadgeWall` elsewhere in the request —
  // and most posts have no race attached, so the common case does one lookup
  // in a Map rather than a second query.
  const catalogue = blog.race
    ? catalogueMap(await getRaceCatalogueEvents())
    : null;

  /**
   * The byline's face.
   *
   * `getBylineAvatar` rather than reading it off `blog.author`, and that is
   * not a stylistic choice: the avatar is a relationship *inside* the author,
   * so reaching it from the post would mean `depth: 2` — which also walks
   * `raceRecord → owner` into a whole `users` row. That helper exists to be
   * the second query instead, and the print route has been using it for
   * exactly this since it was written.
   *
   * Undefined is a real answer, not a failure: an author row with no account
   * behind it was imported rather than registered, and `RiderAvatar` then
   * draws the generated avatar the rider directory already shows for them.
   */
  const bylineAvatar = blog.authorSlug
    ? await getBylineAvatar(blog.authorSlug)
    : undefined;

  return (
    <article className="container relative max-w-3xl py-6 lg:py-10">
      <>
        {blog.date && (
          <time
            dateTime={blog.date}
            className="block text-sm text-muted-foreground"
          >
            Published on {formatDate(blog.date)}
          </time>
        )}

        <h1 className="mt-2 inline-block text-4xl font-extrabold capitalize leading-tight text-foreground lg:text-5xl">
          {blog.title}
        </h1>

        {/* This used to render `siteConfig.authorImage` — which resolves to
            `devbertskie.png`, the blog template author's own photograph —
            beside every member's name, on every article on the site. */}
        {blog.author && (
          <div className="mt-4 flex space-x-4">
            {blog.authorSlug && (
              <RiderAvatar
                rider={{
                  avatar: bylineAvatar,
                  name: blog.author,
                  slug: blog.authorSlug,
                }}
                size={42}
              />
            )}
            <div className="flex-1 text-left leading-tight">
              <p className="font-medium">{blog.author}</p>
              <p className="text-[12px] text-muted-foreground">
                @{blog.author}
              </p>
            </div>
          </div>
        )}

        {/* The badge sits above the cover image, not below the body: it is
            part of what this post *is* — a race report — rather than a
            footnote to it. Present only when the author linked a race
            record, which is the only thing that can supply the distance a
            badge needs. */}
        {blog.race && catalogue && (
          <div
            className="mt-6 flex items-center gap-3 border border-border bg-secondary p-3"
            data-testid="post-race-badge"
          >
            <RaceBadge
              {...resolveBadge(
                catalogue,
                blog.race.eventId,
                blog.race.distanceId,
              )}
              size={56}
              year={blog.race.year}
            />
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold">
                {resolveBadgeEvent(catalogue, blog.race.eventId).name}
              </p>
              <p className="text-xs text-muted-foreground">
                {blog.race.year}
                {" · "}
                {
                  resolveBadgeDistance(
                    catalogue,
                    blog.race.eventId,
                    blog.race.distanceId,
                  ).label
                }
              </p>
            </div>
          </div>
        )}

        {blog.image && (
          <div className="mx-auto my-8 w-1/2 max-w-[720px]">
            <Image
              src={blog.image.src}
              alt={blog.title}
              width={blog.image.width}
              height={blog.image.height}
              priority
              className="mx-auto grayscale"
              sizes="(max-width: 768px) 90vw, 720px"
            />
          </div>
        )}
        {/* Above the body, where a reader decides whether to read or listen —
            and only for a post that has one, since an empty article has
            nothing to say. The control renders nothing at all on a browser
            with no `speechSynthesis`. */}
        {blog.content && (
          <ArticleReader
            title={blog.title}
            content={blog.content}
            musicPlaylist={blog.musicPlaylist}
          />
        )}
        {blog.content && (
          <PayloadRichText data={blog.content} className="article-body" />
        )}
        <hr className="mt-12 h-0 border-t-2 border-border" />
        <div className="flex flex-wrap items-center justify-between gap-4 py-6 lg:py-10">
          <Link
            href="/posts"
            className={cn(buttonVariants({ variant: "ghost" }))}
          >
            <ChevronLeft className="mr-2 size-4" />
            See all Posts
          </Link>

          {/* A plain link, not a button that calls `window.print()`: the
              print page is where the template and the face are chosen, and
              printing the article page itself would put the site's navigation
              on the paper. */}
          <Link
            href={`/print${postPublicPath(blog.slug)}`}
            className={cn(buttonVariants({ variant: "ghost" }))}
            data-testid="post-print-link"
          >
            <Printer className="mr-2 size-4" />
            列印 / PDF
          </Link>
        </div>
      </>
    </article>
  );
}
