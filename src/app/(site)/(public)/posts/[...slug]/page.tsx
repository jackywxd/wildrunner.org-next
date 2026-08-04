import React from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { cn, formatDate } from "@/lib/utils";
import "@/styles/mdx.css";

import Image from "next/image";
import { siteConfig } from "@/config/site";
import { PayloadRichText } from "@/components/payload-rich-text";
import { RaceBadge } from "@/lib/races/badge";
import { findRaceEvent } from "@/lib/races/catalogue";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  getPostBySlugParam,
  getPublishedPostSlugs,
} from "@/lib/content";
import { postPublicPath } from "@/lib/content-paths";

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

        {/* The race this report is about, as the author's own finish badge.
            Named alongside it rather than left as a bare square: a badge is
            recognisable to somebody who already knows the race and opaque to
            everybody else, and a race report is exactly where a reader may
            be meeting it for the first time. */}
        {blog.raceRecord && (
          <div className="mt-4 flex items-center gap-3" data-testid="post-race-badge">
            <RaceBadge
              distanceId={blog.raceRecord.distanceId}
              eventId={blog.raceRecord.eventId}
              size={56}
              year={blog.raceRecord.year}
            />
            <div className="leading-tight">
              <p className="text-sm font-medium">
                {findRaceEvent(blog.raceRecord.eventId)?.name ??
                  blog.raceRecord.eventId}
              </p>
              <p className="text-xs text-muted-foreground">
                {blog.raceRecord.year}
              </p>
            </div>
          </div>
        )}

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
