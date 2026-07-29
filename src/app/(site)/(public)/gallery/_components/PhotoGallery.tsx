"use client";

import { useState, useEffect, useMemo } from "react";
import Lightbox, { type Slide } from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Slideshow from "yet-another-react-lightbox/plugins/slideshow";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/plugins/thumbnails.css";

import React from "react";
import PhotoAlbum from "react-photo-album";
import type { SiteGallery } from "@/lib/content-types";
import { NextJsImage } from "@/app/(site)/(public)/gallery/_components/NextJsImage";
import { GalleryVideos } from "@/app/(site)/(public)/gallery/_components/GalleryVideos";

interface Photo {
  src: string;
  width: number;
  height: number;
  blurDataURL: string;
}

function toPhotos(images: SiteGallery["images"]): Photo[] {
  return images.map((img) => ({
    src: img.src,
    width: img.width,
    height: img.height,
    blurDataURL: img.blurDataURL ?? "",
  }));
}

export const PhotoGallery: React.FC<{ gallery: SiteGallery }> = ({ gallery }) => {
  const [index, setIndex] = useState(-1);
  // Seed first paint immediately (avoid empty → useEffect delay hurting LCP)
  const [photos, setPhotos] = useState<Photo[]>(() =>
    toPhotos(gallery.images.slice(0, 10))
  );

  useEffect(() => {
    setPhotos(toPhotos(gallery.images.slice(0, 10)));

    if (gallery.images.length <= 10) return;

    const timer = setTimeout(() => {
      setPhotos(toPhotos(gallery.images));
    }, 100);
    return () => clearTimeout(timer);
  }, [gallery]);

  const slides: Slide[] = useMemo(() => {
    const imageSlides: Slide[] = photos.map((photo) => ({
      src: photo.src,
      width: photo.width,
      height: photo.height,
    }));
    return imageSlides;
  }, [photos]);

  return (
    <>
      {(gallery.videos?.length ?? 0) > 0 && (
        <div className="mb-6">
          <GalleryVideos
            videos={gallery.videos ?? []}
            gallerySlug={gallery.slug}
          />
        </div>
      )}

      {photos.length > 0 && (
        <PhotoAlbum
          layout="rows"
          targetRowHeight={350}
          photos={photos}
          render={{ image: NextJsImage }}
          defaultContainerWidth={1280}
          sizes={{
            size: "1168px",
            sizes: [
              { viewport: "(max-width: 768px)", size: "calc(100vw - 32px)" },
              { viewport: "(max-width: 1280px)", size: "calc(100vw - 64px)" },
            ],
          }}
          onClick={({ index: i }) => setIndex(i)}
        />
      )}

      <Lightbox
        slides={slides}
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        plugins={[Fullscreen, Slideshow, Thumbnails, Zoom]}
      />
    </>
  );
};

export default PhotoGallery;
