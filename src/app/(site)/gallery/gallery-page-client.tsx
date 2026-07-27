"use client";

import React, { useMemo } from "react";
import type { SiteGallery, SitePhoto } from "@/lib/content-types";
import { Link } from "@/components/transition/react-transition-progress/next";
import { Icon } from "@iconify-icon/react";
import SwiperLightbox from "@/components/swiper/SwiperLightbox";
import { GalleryVideos } from "@/app/(site)/gallery/_components/GalleryVideos";

type GalleryPageClientProps = {
  galleries: SiteGallery[];
};

export default function GalleryPageClient({
  galleries,
}: GalleryPageClientProps) {
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
            精选照片与视频入口
          </p>
          <div className="mt-8">
            <h2 className="text-xl font-extrabold">精选照片</h2>
            <SwiperLightbox
              images={featuredImages}
              autoplay={true}
              featured={true}
            />
          </div>
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
      </div>
    </div>
  );
}
