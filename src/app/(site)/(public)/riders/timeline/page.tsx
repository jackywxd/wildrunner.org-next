import Link from "next/link";

import { ClubTimelineFeed } from "@/components/riders/ClubTimelineFeed";
import PageHeader from "@/components/page-header";
import { siteConfig } from "@/config/site";
import { getClubTimelineRows } from "@/lib/content";
import { getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import {
  CLUB_PAGE_SIZE,
  catalogueForRows,
  clubTimelinePage,
} from "@/lib/riders/club-timeline";

export const dynamic = "force-dynamic";

const TITLE = "野馬營時間機";

/**
 * The club's time machine: every member's races and articles on one rail.
 *
 * A STATIC SEGMENT UNDER `/riders`, which Next resolves ahead of the
 * `[slug]` beside it. The cost is that a member whose slug were literally
 * `timeline` would be unreachable — accepted rather than overlooked, because
 * the alternative (`/timeline` at the site root) puts the club's rail
 * somewhere unrelated to the members it is made of, and slugs come from
 * `author-alias.ts` off a display name.
 *
 * The first page is rendered here and every later one comes from
 * `/api/riders/timeline` as the reader scrolls. Both call the same
 * `getClubTimelineRows()` and slice it the same way, so the route can never
 * return something this page would not have.
 */
export async function generateMetadata() {
  const baseURL = siteConfig.baseURL;
  const title = `${TITLE} | ${siteConfig.title}`;
  const description = "野馬營全體成員跑過的比賽與寫過的文章，依時間排列。";
  const ogImage = `${baseURL}/og?title=${encodeURIComponent(TITLE)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${baseURL}/riders/timeline`,
      images: [{ url: ogImage, alt: TITLE }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function ClubTimelinePage() {
  const [rows, events] = await Promise.all([
    getClubTimelineRows(),
    getRaceCatalogueEvents(),
  ]);

  const page = clubTimelinePage(rows, null, CLUB_PAGE_SIZE);

  return (
    <div className="container max-w-4xl py-6 lg:py-10">
      <PageHeader
        title={TITLE}
        description="所有成員的比賽和文章，接在同一條時間軸上。"
      />

      <hr className="my-8 h-0 border-t-2 border-border" />

      <ClubTimelineFeed
        first={{ ...page, events: catalogueForRows(page.rows, events) }}
      />

      <div className="mt-10 print:hidden">
        <Link className="text-sm text-muted-foreground hover:text-primary" href="/riders">
          ← 所有成員
        </Link>
      </div>
    </div>
  );
}
