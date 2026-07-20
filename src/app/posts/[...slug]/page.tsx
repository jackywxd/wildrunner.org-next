import React from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { posts as allBlogs } from "#site/content";
import { cn, formatDate } from "@/lib/utils";
import "@/styles/mdx.css";

import Image from "next/image";
import { siteConfig } from "@/config/site";
import { Mdx } from "@/components/mdx-component";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

interface BlogPageItemProps {
  params: Promise<{
    slug: string[];
  }>;
}

async function getBlogFromParams(params: BlogPageItemProps["params"]) {
  const slug = (await params).slug.join("/");
  const blog = allBlogs.find((blog) => blog.slugAsParams === slug);

  if (!blog) {
    return null;
  }

  return blog;
}

export async function generateMetadata({
  params,
}: BlogPageItemProps): Promise<Metadata> {
  const baseURL = siteConfig.baseURL;
  const post = await getBlogFromParams(params);

  if (!post) {
    return {};
  }

  let { title, description, image, author } = post;

  const newTitle = `${title} | ${author}`;
  let ogImage = image
    ? `${baseURL}/_next/image?url=${encodeURIComponent(image.src)}&w=1026&h=1026&q=75`
    : `${baseURL}/og?title=${title}|${post.author ?? ""}`;

  return {
    title: newTitle,
    description,
    openGraph: {
      title: newTitle,
      description,
      type: "article",
      url: `${baseURL}/${post.slug}`,
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
  return allBlogs.map((blog) => ({
    slug: blog.slugAsParams.split("/"),
  }));
}

export default async function BlogPageItem({ params }: BlogPageItemProps) {
  const blog = await getBlogFromParams(params);
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

        <h1 className="mt-2 inline-block text-4xl font-bold capitalize leading-tight text-primary lg:text-5xl">
          {blog.title}
        </h1>

        {blog.author && (
          <div className="mt-4 flex space-x-4">
            <Image
              src={siteConfig.authorImage}
              alt={blog.author}
              width={42}
              height={42}
              className="rounded-full bg-white"
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
              src={blog.image}
              alt={blog.title}
              width={720}
              height={405}
              priority
              className="mx-auto"
              placeholder={"blurDataURL" in blog.image ? "blur" : undefined}
            />
          </div>
        )}
        <Mdx code={blog.body} />
        <hr className="mt-12" />
        <div className="flex justify-center py-6 lg:py-10">
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
