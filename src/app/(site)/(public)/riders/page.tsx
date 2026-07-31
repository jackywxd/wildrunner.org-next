import Link from "next/link";

import PageHeader from "@/components/page-header";
import { RiderAvatar } from "@/components/riders/RiderAvatar";
import { siteConfig } from "@/config/site";
import { getRiders } from "@/lib/content";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const baseURL = siteConfig.baseURL;
  const title = `成員 | Riders | ${siteConfig.title}`;
  const description = "野馬營的成員們";
  const ogImage = `${baseURL}/og?title=${encodeURIComponent(title)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${baseURL}/riders`,
      images: [{ url: ogImage, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function RidersPage() {
  const riders = await getRiders();

  return (
    <div className="container max-w-4xl py-6 lg:py-10">
      <PageHeader title="Riders" description="" />
      <hr className="my-8 h-0 border-t-2 border-border" />

      {riders.length ? (
        <div className="grid gap-4 sm:grid-cols-2" data-testid="rider-list">
          {riders.map((rider) => (
            <Link
              key={rider.slug}
              className="group flex items-center gap-4 border border-border bg-secondary p-4 transition-colors hover:bg-secondary/60"
              data-rider-slug={rider.slug}
              data-testid="rider-card"
              href={`/riders/${rider.slug}`}
            >
              <RiderAvatar rider={rider} size={56} />
              <div className="min-w-0">
                <h2 className="truncate font-heading text-lg font-semibold">
                  {rider.name}
                </h2>
                {rider.bio && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {rider.bio}
                  </p>
                )}
                <p
                  className="mt-1 text-xs text-muted-foreground"
                  data-post-count={rider.postCount}
                  data-testid="rider-post-count"
                >
                  {rider.postCount} 篇文章
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">還沒有成員。</p>
      )}
    </div>
  );
}
