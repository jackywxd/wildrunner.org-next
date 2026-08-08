"use client";

import React, { useMemo, useState } from "react";
import type { SiteGallery, SitePhoto, SiteVideo } from "@/lib/content-types";
import { Link } from "@/components/transition/react-transition-progress/next";
import { Icon } from "@iconify-icon/react";
import SwiperLightbox from "@/components/swiper/SwiperLightbox";
import { GalleryVideos } from "@/app/(site)/(public)/gallery/_components/GalleryVideos";
import { AllPhotosView } from "@/app/(site)/(public)/gallery/_components/AllPhotosView";
import { cn } from "@/lib/utils";

type GalleryPageClientProps = {
  galleries: SiteGallery[];
  /** Photos tagged with a race but not necessarily in any album — see getRaceTaggedPhotos. */
  raceTaggedPhotos: SitePhoto[];
  /** Videos tagged with a race but not necessarily in any album — see getRaceTaggedVideos. */
  raceTaggedVideos: SiteVideo[];
};

type GalleryView = "all" | "albums";

function ViewChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border px-3 py-1 text-xs leading-tight transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
      data-active={active}
    >
      {children}
    </button>
  );
}

export default function GalleryPageClient({
  galleries,
  raceTaggedPhotos,
  raceTaggedVideos,
}: GalleryPageClientProps) {
  // Default: every photo across every published gallery, newest first —
  // "browse everything" is what most visitors want from a link labelled
  // 相册, not a shelf of albums they have to open one at a time. The
  // by-album layout (today's old default) is still one click away.
  const [view, setView] = useState<GalleryView>("all");

  const allPhotos = useMemo(() => {
    const seen = new Set<string>();
    const combined: SitePhoto[] = [];
    // Gallery-curated photos and race-tagged photos are two different
    // paths to "this is public" (album membership vs. a member's own race
    // tag) and can overlap on the same underlying upload — deduped by src,
    // the one stable identifier both sources carry.
    for (const photo of [
      ...galleries.flatMap((gallery) => gallery.images),
      ...raceTaggedPhotos,
    ]) {
      if (seen.has(photo.src)) continue;
      seen.add(photo.src);
      combined.push(photo);
    }
    return combined.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [galleries, raceTaggedPhotos]);

  const featuredImages = useMemo(() => {
    const featured = galleries.reduce((acc, gallery) => {
      return acc.concat(gallery.images.filter((image) => image.featured));
    }, [] as SitePhoto[]);
    return featured.length > 20 ? featured.slice(0, 20) : featured;
  }, [galleries]);

  const gallerySections = useMemo(() => {
    return galleries
      .filter(
        (gallery) =>
          gallery.images.length > 0 || (gallery.videos?.length ?? 0) > 0,
      )
      .sort((a, b) => {
        const dateA = new Date(a?.created ?? 0);
        const dateB = new Date(b?.created ?? 0);
        return dateB.getTime() - dateA.getTime();
      })
      .map((gallery) => {
        return gallery.images.length > 10
          ? { ...gallery, images: gallery.images.slice(0, 10) }
          : gallery;
      });
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
            <ViewChip active={view === "all"} onClick={() => setView("all")}>
              全部相片
            </ViewChip>
            <ViewChip active={view === "albums"} onClick={() => setView("albums")}>
              依相簿
            </ViewChip>
          </div>

          {view === "all" && (
            <div className="mt-8 space-y-8">
              {raceTaggedVideos.length > 0 && (
                <div data-testid="gallery-all-photos-videos">
                  <GalleryVideos videos={raceTaggedVideos} compact />
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

            {gallerySections.map((gallery) => (
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
                    {(gallery.videos?.length ?? 0) > 0 && (
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

                {(gallery.videos?.length ?? 0) > 0 && (
                  <div className="mt-4">
                    <GalleryVideos
                      videos={gallery.videos}
                      gallerySlug={gallery.slug}
                      compact
                    />
                  </div>
                )}

                {gallery.images.length > 0 && (
                  <div className="mt-4">
                    <SwiperLightbox images={gallery.images} maxHeight={160} />
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
