"use client";

import { NextPage } from "next";
import React, { useMemo } from "react";
import { galleries } from "#site/content";
import { RdPhoto } from "@/lib/veliteUtils";
import { Link } from "@/components/transition/react-transition-progress/next";
import { Icon } from "@iconify-icon/react";
import SwiperLightbox from "@/components/swiper/SwiperLightbox";
import { GalleryVideos } from "@/app/gallery/_components/GalleryVideos";

const GalleryPage: NextPage = () => {
  const featuredImages = useMemo(() => {
    const featured = galleries.reduce((acc, gallery) => {
      return acc.concat(gallery.images.filter((image) => image.featured));
    }, [] as RdPhoto[]);
    return featured.length > 20 ? featured.slice(0, 20) : featured;
  }, [galleries]);

  const gallerySections = useMemo(() => {
    return galleries
      .filter(
        (gallery) =>
          gallery.images.length > 0 || (gallery.videos?.length ?? 0) > 0
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
    <>
      <div className="prose-article flex flex-col gap-4">
        <section className="-mx-content">
          <h1 className="px-content mb-2">精选照片</h1>
          <SwiperLightbox
            images={featuredImages}
            autoplay={true}
            featured={true}
          />
        </section>
        {gallerySections.map((gallery) => (
          <section key={gallery.slug} className="-mx-content">
            <button className="group btn btn-ghost btn-lg rounded-2xl mb-2 outline-transparent border-none p-0">
              <Link
                href={`gallery/${gallery.slug}`}
                className="px-content flex items-center not-prose"
              >
                <h1 className="text-h1">{gallery.name}</h1>
                {(gallery.videos?.length ?? 0) > 0 && (
                  <Icon
                    className="text-h2 ml-1 opacity-70"
                    icon="heroicons:play-circle"
                    inline
                  />
                )}
                <Icon
                  className="text-h2 transition-apple group-hover:translate-x-1/3"
                  icon="heroicons:chevron-right"
                  inline
                />
              </Link>
            </button>
            {(gallery.videos?.length ?? 0) > 0 && (
              <div className="mb-3">
                <GalleryVideos
                  videos={gallery.videos}
                  gallerySlug={gallery.slug}
                  compact
                />
              </div>
            )}
            {gallery.images.length > 0 && (
              <SwiperLightbox images={gallery.images} maxHeight={160} />
            )}
          </section>
        ))}
      </div>
    </>
  );
};

export default GalleryPage;
