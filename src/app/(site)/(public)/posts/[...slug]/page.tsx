import React from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { cn, formatDate } from "@/lib/utils";
import "@/styles/mdx.css";

import Image from "next/image";
import { siteConfig } from "@/config/site";
import { PayloadRichText } from "@/components/payload-rich-text";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  getPostBySlugParam,
  getPublishedPostSlugs,
} from "@/lib/content";
import { postPublicPath } from "@/lib/content-paths";
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
  const baseURL = siteConfig.baseURL;
  const slugParam = (await params).slug.join("/");
  const post = await getPostBySlugParam(slugParam);

  if (!post) {
    return {};
  }

  const { title, description, image, author } = post;

  const newTitle = `${title} | ${author ?? siteConfig.author}`;
  const ogImage = image?.src
    ? image.src
    : `${baseURL}/og?title=${encodeURIComponent(`${title}|${author ?? ""}`)}`;

  return {
    title: newTitle,
    description,
    openGraph: {
      title: newTitle,
      description,
      type: "article",
      url: `${baseURL}${postPublicPath(post.slug)}`,
      images: [
        {
          url: ogImage,
          alt: newTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: newTitle,
      description,
      images: [ogImage],
    },
  };
}

export async function generateStaticParams() {
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
  const catalogue = blog.race ? catalogueMap(await getRaceCatalogueEvents()) : null;

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

        {blog.author && (
          <div className="mt-4 flex space-x-4">
            <Image
              src={siteConfig.authorImage}
              alt={blog.author}
              width={42}
              height={42}
              className="grayscale border border-border bg-secondary"
            />
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
              {...resolveBadge(catalogue, blog.race.eventId, blog.race.distanceId)}
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
        {blog.content && (
          <PayloadRichText
            data={blog.content}
            className="prose prose-neutral dark:prose-invert max-w-none"
          />
        )}
        <hr className="mt-12 h-0 border-t-2 border-border" />
        <div className="flex justify-start py-6 lg:py-10">
          <Link
            href="/posts"
            className={cn(buttonVariants({ variant: "ghost" }))}
          >
            <ChevronLeft className="mr-2 size-4" />
            See all Posts
          </Link>
        </div>
      </>
    </article>
  );
}
