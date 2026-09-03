import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PhotoGallery from "@/app/(site)/(public)/gallery/_components/PhotoGallery";
import { siteConfig } from "@/config/site";
import { resolveGalleryOgCard } from "@/lib/galleryOg";
import { pageMetadata } from "@/lib/site-metadata";
import { photosOf, videosOf } from "@/lib/media/gallery-items";
import { raceFilterOptions } from "@/lib/media/gallery-index";
import {
  getGalleryBySlug,
  getGalleryRaceEditions,
  getSiteGlobals,
} from "@/lib/content";

// No `generateStaticParams` here, deliberately. This route is force-dynamic,
// so nothing it returned could ever be prerendered — but Next asks for it
// anyway, in a child process it forks per dynamic route (`next dev`'s
// `getStaticPathsWorker`, and again during a build). That child evaluates
// payload.config, opens its own miniflare over the same local D1 the dev
// server is serving from, and then spends a `getPublishedGalleries()` on a
// list that is thrown away: measured at `generate-params: 2.1s` on one
// request, and one more process contending for a SQLite file that answers
// `SQLITE_BUSY` when two of them meet. See payload.config.ts for the rest.
export const dynamic = "force-dynamic";

interface GalleryDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({
  params,
}: GalleryDetailPageProps): Promise<Metadata> {
  const gallery = await getGalleryBySlug((await params).slug);
  // No title for the missing case: the page throws `notFound()`, and the
  // metadata of a segment that threw is discarded. `app/not-found.tsx` owns
  // what a 404 says — the line that used to be here never reached a browser.
  if (gallery == null) return {};

  return pageMetadata({
    path: `/gallery/${gallery.slug}`,
    title: gallery.name,
    subtitle: `${gallery.name}的照片`,
    card: resolveGalleryOgCard(gallery),
  });
}

const GalleryDetailPage: React.FC<GalleryDetailPageProps> = async ({
  params,
}) => {
  const gallery = await getGalleryBySlug((await params).slug);
  if (!gallery) notFound();

  const photoCount = photosOf(gallery.items).length;
  const videoCount = videosOf(gallery.items).length;
  // Named from the same list the wall labels its filter from, so one race
  // reads identically in both places. Restricted to this album's own items,
  // so an option can never empty the grid it sits above — and a virtual race
  // album, whose items are all one race, correctly offers nothing to choose.
  const races = raceFilterOptions(gallery.items, await getGalleryRaceEditions());

  return (
    <div className="container relative max-w-7xl py-6 lg:py-10">
      {/* Named so a test can address this album's own photos. Without it the
          only handle is `img`, which on this page first matches the site
          logo in the header — a click that navigates home and then fails as
          "the lightbox did not open". */}
      <div className="flex flex-col gap-4" data-testid="gallery-album">
        <h1 className="text-4xl font-black leading-[1.12] text-foreground">
          {gallery.name}
        </h1>
        <div className="text-left text-sm text-muted-foreground">
          {photoCount}张照片
          {videoCount > 0 ? ` · ${videoCount}个视频` : null}
        </div>
        <PhotoGallery gallery={gallery} races={races} />
      </div>
    </div>
  );
};

export default GalleryDetailPage;
