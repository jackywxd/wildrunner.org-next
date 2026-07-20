import React from "react";
import PageHeader from "@/components/page-header";
import { posts as allBlogs } from "#site/content";
import Image from "next/image";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { siteConfig } from "@/config/site";

export function generateMetadata() {
  const baseURL = siteConfig.baseURL;
  const title = `文章 | Posts | ${siteConfig.title}`;
  const description = siteConfig.description;
  const ogImage = `${baseURL}/og?title=${encodeURIComponent(title)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${baseURL}/posts`,
      images: [
        {
          url: ogImage,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function BlogPage() {
  const blogs = allBlogs
    .filter((blog) => blog.published)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return (
    <div className="container max-w-4xl py-6 lg:py-10">
      <PageHeader title="Posts" description="" />
      <hr className="my-8" />

      {blogs.length ? (
        <div className="grid gap-10 sm:grid-cols-2">
          {blogs.map((blog) => (
            <article
              key={blog.slug}
              className="group relative flex flex-col space-y-2"
            >
              {blog.image && (
                <div className="flex w-full h-[200px] overflow-hidden justify-center items-center">
                  <Image
                    src={blog.image}
                    alt={blog.title}
                    width={804}
                    height={452}
                    className="transition-colors"
                    loading="lazy"
                    placeholder={
                      "blurDataURL" in blog.image ? "blur" : undefined
                    }
                  />
                </div>
              )}

              <h2 className="text-2xl font-extrabold text-primary">
                {blog.title}
              </h2>
              <p className="text-muted-foreground underline font-bold">
                {blog.author}
              </p>
              {blog.description && (
                <p className="text-muted-foreground">{blog.description}</p>
              )}
              {blog.date && (
                <p className="text-sm text-muted-foreground">
                  {formatDate(blog.date)}
                </p>
              )}

              <Link href={blog.slug} className="absolute inset-0">
                <span className="sr-only">View Article</span>
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <p>No Posts found</p>
      )}
    </div>
  );
}
