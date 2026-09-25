import React from "react";
import PageHeader from "@/components/page-header";
import Image from "next/image";
import Link from "@/components/i18n/locale-link";
import { formatDate } from "@/lib/utils";
import { getPublishedPosts } from "@/lib/content";
import { postPublicPath } from "@/lib/content-paths";
import { pageMetadata } from "@/lib/site-metadata";
import { currentLocale, getDictionary } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getDictionary();
  return pageMetadata({
    locale: await currentLocale(),
    // The subject alone. This was `文章 | Posts | 野馬營`, and the card
    // generator read the last `|` as a byline separator — see `pageMetadata`.
    path: "/posts",
    title: t.posts.title,
    subtitle: t.posts.subtitle,
    card: { kind: "plain" },
  });
}

export default async function BlogPage() {
  const t = await getDictionary();
  const blogs = (await getPublishedPosts(await currentLocale())).sort(
    (a, b) =>
      new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime(),
  );

  return (
    <div className="container max-w-4xl py-6 lg:py-10">
      <PageHeader title={t.posts.title} description="" />
      <hr className="my-8 h-0 border-t-2 border-border" />

      {blogs.length ? (
        <div className="grid gap-10 sm:grid-cols-2">
          {blogs.map((blog, index) => (
            <article
              key={blog.slug}
              className="group relative flex flex-col space-y-2 border border-border bg-secondary p-4"
            >
              {blog.image && (
                <div className="flex w-full h-[200px] overflow-hidden justify-center items-center">
                  <Image
                    src={blog.image.src}
                    alt={blog.title}
                    width={blog.image.width}
                    height={blog.image.height}
                    sizes="(max-width: 640px) 100vw, 400px"
                    // Filling the frame, not the image's own pixel width.
                    // Without `w-full` the `<img width>` — the original's,
                    // ~2000px — is the card's min-content width, and a grid
                    // item does not shrink below that: at 375px the whole
                    // page scrolled sideways by 1654px and every title was
                    // cut in half.
                    className="h-full w-full object-cover transition-colors grayscale"
                    priority={index < 2}
                    loading={index < 2 ? undefined : "lazy"}
                    placeholder={blog.image.blurDataURL ? "blur" : undefined}
                    blurDataURL={blog.image.blurDataURL}
                  />
                </div>
              )}

              <h2 className="text-2xl font-extrabold text-foreground group-hover:text-primary">
                {blog.title}
              </h2>
              <p className="text-muted-foreground">{blog.author}</p>
              {blog.description && (
                <p className="text-muted-foreground">{blog.description}</p>
              )}
              {blog.date && (
                <p className="text-sm text-muted-foreground">
                  {formatDate(blog.date)}
                </p>
              )}

              <Link href={postPublicPath(blog.slug)} className="absolute inset-0">
                <span className="sr-only">{t.posts.read}</span>
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <p>{t.posts.empty}</p>
      )}
    </div>
  );
}
