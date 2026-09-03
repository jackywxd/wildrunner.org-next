import Link from "next/link";
import { notFound } from "next/navigation";

import { RiderAvatar } from "@/components/riders/RiderAvatar";
import { RiderTimeline } from "@/components/riders/RiderTimeline";
import { RiderViewTabs } from "@/components/riders/RiderViewTabs";
import { siteConfig } from "@/config/site";
import { getRiderTimeline } from "@/lib/content";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const found = await getRiderTimeline(slug);
  if (!found) return {};

  const { rider } = found;
  const baseURL = siteConfig.baseURL;
  const title = `${rider.name} 的時間機 | ${siteConfig.title}`;
  const description = `${rider.name} 跑過的比賽與寫過的文章，依時間排列。`;
  const ogImage = `${baseURL}/og?title=${encodeURIComponent(`${rider.name} 的時間機`)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      url: `${baseURL}/riders/${rider.slug}/timeline`,
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

/**
 * 時間機 — the member's own history, races and articles on one rail.
 *
 * ITS OWN ROUTE RATHER THAN A THIRD BLOCK ON THE PROFILE. The timeline
 * contains every article the profile's grid already shows, so the two cannot
 * sit on one page without listing the same posts twice; `RiderViewTabs`
 * switches between them and both pages render it. A separate URL is also what
 * makes the printed version make sense — nobody wants the profile's badge
 * wall on the front of a printout of their racing history.
 *
 * `force-dynamic`, matching the profile it belongs to: a member logging a race
 * or publishing an article expects to see it here on the next load, and this
 * page is behind no cache tag of its own.
 */
export default async function RiderTimelinePage({ params }: Params) {
  const { slug } = await params;
  const found = await getRiderTimeline(slug);
  if (!found) notFound();

  const { rider, years } = found;

  return (
    <div className="container max-w-4xl py-6 lg:py-10">
      <div
        className="flex items-start gap-5"
        data-testid="rider-timeline-profile"
      >
        <RiderAvatar rider={rider} size={64} />
        <div className="min-w-0 flex-1">
          <h1
            className="font-heading text-3xl font-extrabold tracking-tight lg:text-4xl"
            data-testid="rider-name"
          >
            {rider.name} 的時間機
          </h1>
          <div className="mt-3">
            <RiderViewTabs active="timeline" slug={rider.slug} />
          </div>
        </div>
      </div>

      <hr className="my-8 h-0 border-t-2 border-border" />

      <RiderTimeline name={rider.name} slug={rider.slug} years={years} />

      <div className="mt-10 print:hidden">
        <Link
          className="text-sm text-muted-foreground hover:text-primary"
          href={`/riders/${rider.slug}`}
        >
          ← 回到 {rider.name} 的頁面
        </Link>
      </div>
    </div>
  );
}
