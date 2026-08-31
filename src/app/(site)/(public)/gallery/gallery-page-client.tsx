"use client";

import React, { useMemo, useState } from "react";
import type { SiteGallery, SitePhoto, SiteVideo } from "@/lib/content-types";
import { Link } from "@/components/transition/react-transition-progress/next";
import { Icon } from "@iconify-icon/react";
import SwiperLightbox from "@/components/swiper/SwiperLightbox";
import { GalleryVideos } from "@/app/(site)/(public)/gallery/_components/GalleryVideos";
import { AllPhotosView } from "@/app/(site)/(public)/gallery/_components/AllPhotosView";
import { photosOf, videosOf } from "@/lib/media/gallery-items";
import { cn } from "@/lib/utils";

type GalleryPageClientProps = {
  galleries: SiteGallery[];
  /** Every upload marked as photo-wall content, album membership irrelevant — see getGalleryPhotos. */
  libraryPhotos: SitePhoto[];
  /** The video half of the same set — see getGalleryVideos. */
  libraryVideos: SiteVideo[];
};

type GalleryView = "all" | "albums";

function ViewChip({
  active,
  children,
  onClick,
  // Named for the attribute rather than something like `testId` so the
  // attribute itself appears literally at each call site, which is what
  // `scripts/assert-schema-screen.mjs` greps for. A renamed prop passes
  // typecheck and fails that check — correctly, since its whole job is to
  // prove a selector a test uses really exists. (Deliberately not spelling
  // the attribute out in this comment: a checker that matches its own
  // documentation is the false positive VERIFICATION.md warns about.)
  "data-testid": testId,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  "data-testid": string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "border px-3 py-1 text-xs leading-tight transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
      // The only signal that the view has actually switched. These chips
      // are server-rendered, so a click landing before hydration is
      // silently dropped and the shelf never appears — which is exactly how
      // this failed in CI while passing locally, where a warm dev server
      // hydrates before a test can click.
      data-active={active}
    >
      {children}
    </button>
  );
}

export default function GalleryPageClient({
  galleries,
  libraryPhotos,
  libraryVideos,
}: GalleryPageClientProps) {
  // Default: every photo across every published gallery, newest first —
  // "browse everything" is what most visitors want from a link labelled
  // 相册, not a shelf of albums they have to open one at a time. The
  // by-album layout (today's old default) is still one click away.
  const [view, setView] = useState<GalleryView>("all");

  const allPhotos = useMemo(() => {
    const seen = new Set<string>();
    const combined: SitePhoto[] = [];
    // Album membership and `media.usage` are two different paths to "this is
    // public" (an editor curated it vs. a member uploaded it to the library)
    // and can overlap on the same underlying upload — deduped by src, the one
    // stable identifier both sources carry.
    for (const photo of [
      ...galleries.flatMap((gallery) => photosOf(gallery.items)),
      ...libraryPhotos,
    ]) {
      if (seen.has(photo.src)) continue;
      seen.add(photo.src);
      combined.push(photo);
    }
    return combined.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [galleries, libraryPhotos]);

  /**
   * Every public video, from both paths, deduped — the exact counterpart of
   * `allPhotos` above.
   *
   * Its absence is what made gallery videos invisible on this page. The
   * "all" view rendered only the videos a member had tagged with a race; the
   * 23 videos that live in an album and carry no race tag appeared nowhere on
   * /gallery, while the album pages showed them fine. The player's own
   * header describes this strip as rendering "every video of every gallery"
   * — that was the intent, and this is what makes it true.
   *
   * Deduped by `src` for the same reason `allPhotos` is: album membership and
   * `media.usage` are two different routes to "this is public" and one upload
   * can have both. `src` is the identifier both sources carry, and is already
   * what `GalleryVideos` keys on.
   *
   * Sorted newest-first, exactly like `allPhotos`. It could not be before,
   * because `SiteVideo` carried no `createdAt`; the strip was therefore
   * "album videos, then the rest of the library", which put a member's newest
   * upload behind all 23 album videos — 24th in a horizontally scrolling strip,
   * which reads as "my video is not on the gallery". The field exists now, so
   * the two halves of this page finally agree on what order means.
   */
  const allVideos = useMemo(() => {
    const seen = new Set<string>();
    const combined: SiteVideo[] = [];
    for (const video of [
      ...galleries.flatMap((gallery) => videosOf(gallery.items)),
      ...libraryVideos,
    ]) {
      if (seen.has(video.src)) continue;
      seen.add(video.src);
      combined.push(video);
    }
    return combined.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [galleries, libraryVideos]);

  const featuredImages = useMemo(() => {
    const featured = galleries.reduce((acc, gallery) => {
      return acc.concat(
        photosOf(gallery.items).filter((image) => image.featured),
      );
    }, [] as SitePhoto[]);
    return featured.length > 20 ? featured.slice(0, 20) : featured;
  }, [galleries]);

  // Each section still shows its two halves separately, so they are derived
  // here rather than in the JSX — one pass over `items` per album instead of
  // four. The photo cap is the same 10 this shelf has always shown; the album
  // page is where the rest lives.
  const gallerySections = useMemo(() => {
    return galleries
      .map((gallery) => ({
        gallery,
        photos: photosOf(gallery.items),
        videos: videosOf(gallery.items),
      }))
      .filter((section) => section.photos.length > 0 || section.videos.length > 0)
      .sort((a, b) => {
        const dateA = new Date(a.gallery.created ?? 0);
        const dateB = new Date(b.gallery.created ?? 0);
        return dateB.getTime() - dateA.getTime();
      })
      .map((section) => ({ ...section, photos: section.photos.slice(0, 10) }));
  }, [galleries]);

  return (
    <div className="container max-w-7xl py-6 lg:py-10">
      <div className="flex flex-col gap-6">
        <section className="border-t-2 border-border pt-8">
          <h1 className="text-4xl font-extrabold text-foreground">相册</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {view === "all" ? "所有照片，依时间排序" : "精选照片与视频入口"}
          </p>

          <div className="mt-4 flex gap-2" data-testid="gallery-view-toggle">
            <ViewChip
              active={view === "all"}
              onClick={() => setView("all")}
              data-testid="gallery-view-all"
            >
              全部相片
            </ViewChip>
            <ViewChip
              active={view === "albums"}
              onClick={() => setView("albums")}
              data-testid="gallery-view-albums"
            >
              依相簿
            </ViewChip>
          </div>

          {view === "all" && (
            <div className="mt-8 space-y-8">
              {allVideos.length > 0 && (
                <div data-testid="gallery-all-photos-videos">
                  <GalleryVideos videos={allVideos} compact />
                </div>
              )}
              <div data-testid="gallery-all-photos">
                <AllPhotosView photos={allPhotos} />
              </div>
            </div>
          )}
        </section>

        {view === "albums" && (
          <>
            <section className="border-t-2 border-border pt-8">
              <h2 className="text-xl font-extrabold">精选照片</h2>
              <SwiperLightbox
                images={featuredImages}
                autoplay={true}
                featured={true}
              />
            </section>

            {gallerySections.map(({ gallery, photos, videos }) => (
              <section
                key={gallery.slug}
                className="border-t-2 border-border pt-8"
              >
                <Link
                  href={`/gallery/${gallery.slug}`}
                  className="group flex items-center justify-between gap-4"
                >
                  <h1 className="text-2xl font-extrabold text-foreground">
                    {gallery.name}
                  </h1>
                  <div className="flex items-center gap-3">
                    {videos.length > 0 && (
                      <Icon
                        className="opacity-70"
                        icon="heroicons:play-circle"
                        inline
                      />
                    )}
                    <Icon
                      className="opacity-70 transition-transform group-hover:translate-x-1/3"
                      icon="heroicons:chevron-right"
                      inline
                    />
                  </div>
                </Link>

                {videos.length > 0 && (
                  <div className="mt-4">
                    <GalleryVideos
                      videos={videos}
                      gallerySlug={gallery.slug}
                      compact
                    />
                  </div>
                )}

                {photos.length > 0 && (
                  <div className="mt-4">
                    <SwiperLightbox images={photos} maxHeight={160} />
                  </div>
                )}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
