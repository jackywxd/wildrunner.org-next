import Link from "next/link";
import { notFound } from "next/navigation";

import { RiderAvatar } from "@/components/riders/RiderAvatar";
import { RiderTimeline } from "@/components/riders/RiderTimeline";
import { RiderViewTabs } from "@/components/riders/RiderViewTabs";
import { getRiderTimeline } from "@/lib/content";
import { pageMetadata } from "@/lib/site-metadata";
import { currentLocale, getDictionary } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const t = await getDictionary();
  const { slug } = await params;
  const found = await getRiderTimeline(slug);
  if (!found) return {};

  const { rider } = found;
  return pageMetadata({
    locale: await currentLocale(),
    // 「的」 binds directly to the name: the half-width space that used to sit
    // in front of it came from string interpolation, not from typography.
    path: `/riders/${rider.slug}/timeline`,
    title: t.riderTimeline.title.replace("{name}", rider.name),
    subtitle: t.riderTimeline.subtitle.replace("{name}", rider.name),
    type: "profile",
    // A MEMBER IS SOMETHING, so they get their own colours rather than the
    // site's furniture card. Seeded on the slug, which means their profile and
    // their 穿越時光 carry the same card — the subject of both pages is them.
    //
    // NOT their avatar, although `getBylineAvatar` could supply one: an avatar
    // is a small square and a card is 1920×1080, so using it as the image
    // means a platform crops it badly, and using it as a card background means
    // upscaling a few hundred pixels across the whole width.
    card: { kind: "rainbow", seed: rider.slug },
  });
}

/**
 * 穿越時光 — the member's own history, races and articles on one rail.
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
  const t = await getDictionary();
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
            {t.riderTimeline.heading.replace("{name}", rider.name)}
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
          {t.riderTimeline.backToRider.replace("{name}", rider.name)}
        </Link>
      </div>
    </div>
  );
}
