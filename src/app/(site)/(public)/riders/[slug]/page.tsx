import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RiderAvatar } from "@/components/riders/RiderAvatar";
import { RiderBadgeWall } from "@/components/riders/RiderBadges";
import { RiderViewTabs } from "@/components/riders/RiderViewTabs";
import { siteConfig } from "@/config/site";
import { getRiderBySlug } from "@/lib/content";
import { postPublicPath } from "@/lib/content-paths";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const found = await getRiderBySlug(slug);
  if (!found) return {};

  const { rider } = found;
  const baseURL = siteConfig.baseURL;
  const title = `${rider.name} | ${siteConfig.title}`;
  const description = rider.bio ?? `${rider.name} 在野馬營的文章`;
  const ogImage = `${baseURL}/og?title=${encodeURIComponent(rider.name)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      url: `${baseURL}/riders/${rider.slug}`,
      images: [{ url: ogImage, alt: rider.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function RiderPage({ params }: Params) {
  const { slug } = await params;
  const found = await getRiderBySlug(slug);
  if (!found) notFound();

  const { posts, rider } = found;

  return (
    <div className="container max-w-6xl py-6 lg:py-10">
      <div className="flex items-start gap-5" data-testid="rider-profile">
        <RiderAvatar rider={rider} size={88} />
        <div className="min-w-0 flex-1">
          <h1
            className="font-heading text-4xl font-extrabold tracking-tight lg:text-5xl"
            data-testid="rider-name"
          >
            {rider.name}
          </h1>
          {/* Bounded, because the container around it is not. The page moved
              to max-w-6xl to match the directory, and the bio is the only
              thing on it that is a paragraph — at 1440px it was setting
              1012px lines, about 65 Chinese characters, where a readable
              measure is nearer 40. max-w-2xl is 672px, which is 44 of them
              at this size. The header's own width is unchanged; only the
              prose inside it is held back. */}
          {rider.bio && (
            <p
              className="mt-3 max-w-2xl whitespace-pre-line text-muted-foreground"
              data-testid="rider-bio"
            >
              {rider.bio}
            </p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {rider.postCount} 篇文章
          </p>
          <div className="mt-4">
            <RiderViewTabs active="posts" slug={rider.slug} />
          </div>
        </div>
      </div>

      {rider.races.length > 0 && (
        <div className="mt-8">
          <RiderBadgeWall records={rider.races} />
        </div>
      )}

      <hr className="my-8 h-0 border-t-2 border-border" />

      {posts.length ? (
        <div className="grid gap-10 sm:grid-cols-2" data-testid="rider-posts">
          {posts.map((post, index) => (
            <article
              key={post.slug}
              className="group relative flex flex-col space-y-2 border border-border bg-secondary p-4"
              data-post-slug={post.slug}
              data-testid="rider-post"
            >
              {post.image && (
                <div className="flex h-[200px] w-full items-center justify-center overflow-hidden">
                  <Image
                    alt={post.title}
                    blurDataURL={post.image.blurDataURL}
                    className="grayscale transition-colors"
                    height={post.image.height}
                    loading={index < 2 ? undefined : "lazy"}
                    placeholder={post.image.blurDataURL ? "blur" : undefined}
                    priority={index < 2}
                    sizes="(max-width: 640px) 100vw, 400px"
                    src={post.image.src}
                    width={post.image.width}
                  />
                </div>
              )}

              <h2 className="text-2xl font-extrabold text-foreground group-hover:text-primary">
                {post.title}
              </h2>
              {post.description && (
                <p className="text-muted-foreground">{post.description}</p>
              )}
              {post.date && (
                <p className="text-sm text-muted-foreground">
                  {formatDate(post.date)}
                </p>
              )}

              <Link className="absolute inset-0" href={postPublicPath(post.slug)}>
                <span className="sr-only">閱讀文章</span>
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground" data-testid="rider-no-posts">
          還沒有發布文章。
        </p>
      )}

      <div className="mt-10">
        <Link className="text-sm text-muted-foreground hover:text-primary" href="/riders">
          ← 所有成員
        </Link>
      </div>
    </div>
  );
}
