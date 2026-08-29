import Link from "next/link";

import PageHeader from "@/components/page-header";
import { RiderAvatar } from "@/components/riders/RiderAvatar";
import { RiderBadgeRow } from "@/components/riders/RiderBadges";
import { RiderFilters } from "@/components/riders/RiderFilters";
import { siteConfig } from "@/config/site";
import { getRiders } from "@/lib/content";
import { catalogueMap, getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import {
  filterRidersByBadges,
  parseRiderBadges,
  riderBadgeOptions,
} from "@/lib/riders/badge-filter";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const baseURL = siteConfig.baseURL;
  const title = `野馬 | ${siteConfig.title}`;
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

export default async function RidersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const badges = parseRiderBadges(await searchParams);
  const all = await getRiders();
  // Options are built from every rider and counted against the selection —
  // see riderBadgeOptions. Passing the filtered list instead would make a
  // chip's number describe the page it is already on rather than the page
  // it leads to.
  const options = riderBadgeOptions(
    all,
    catalogueMap(await getRaceCatalogueEvents()),
    badges,
  );
  const riders = filterRidersByBadges(all, badges);

  return (
    <div className="container max-w-4xl py-6 lg:py-10">
      <PageHeader title="野馬" description="" />

      <div className="mt-6">
        <RiderFilters options={options} selected={badges} total={all.length} />
      </div>

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
                <RiderBadgeRow records={rider.races} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        // Two different facts, and saying the wrong one is how a filter
        // lies: an empty directory means the club has no members, an empty
        // *result* means nobody here has that badge yet.
        <p className="text-muted-foreground" data-testid="rider-empty">
          {badges.length === 0
            ? "還沒有成員。"
            : badges.length === 1
              ? "還沒有成員拿到這個徽章。"
              : // Says 同時, because with AND that is the whole reason the
                // page is empty: each badge on its own may well have
                // somebody, and without the word this reads as though none
                // of them does.
                "沒有成員同時拿到這些徽章。"}
        </p>
      )}
    </div>
  );
}
