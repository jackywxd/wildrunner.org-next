"use client";

import { useEffect, useMemo, useState } from "react";
import Lightbox, { type Slide } from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Slideshow from "yet-another-react-lightbox/plugins/slideshow";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/plugins/thumbnails.css";

import PhotoAlbum from "react-photo-album";
import type { SitePhoto } from "@/lib/content-types";
import { NextJsImage } from "@/app/(site)/(public)/gallery/_components/NextJsImage";

interface Photo {
  src: string;
  width: number;
  height: number;
  blurDataURL: string;
}

/** More than PhotoGallery.tsx's 10 — this view is the whole site's photos, not one album's. */
const SEED_COUNT = 24;

function toPhotos(images: SitePhoto[]): Photo[] {
  return images.map((img) => ({
    src: img.src,
    width: img.width,
    height: img.height,
    blurDataURL: img.blurDataURL ?? "",
  }));
}

/**
 * Every photo across every published gallery, already sorted by the
 * caller — this component only lays it out and drives the lightbox.
 *
 * Mirrors PhotoGallery.tsx's rendering (react-photo-album + the same
 * lightbox plugins) rather than reusing it directly: that component is
 * keyed to one SiteGallery's own images/videos/slug, and a flat
 * cross-gallery list has none of those. Same reasoning RacePhotoWall.tsx
 * already applied for the same choice.
 */
export function AllPhotosView({ photos: allPhotos }: { photos: SitePhoto[] }) {
  const [index, setIndex] = useState(-1);
  // Seed first paint immediately, then swap in the rest — same two-stage
  // trick PhotoGallery.tsx uses, scaled to a whole-site list instead of
  // one album's.
  const [photos, setPhotos] = useState<Photo[]>(() =>
    toPhotos(allPhotos.slice(0, SEED_COUNT)),
  );

  useEffect(() => {
    setPhotos(toPhotos(allPhotos.slice(0, SEED_COUNT)));
    if (allPhotos.length <= SEED_COUNT) return;
    const timer = setTimeout(() => setPhotos(toPhotos(allPhotos)), 100);
    return () => clearTimeout(timer);
  }, [allPhotos]);

  const slides: Slide[] = useMemo(
    () => photos.map((photo) => ({ src: photo.src, width: photo.width, height: photo.height })),
    [photos],
  );

  if (photos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="gallery-all-photos-empty">
        還沒有照片。
      </p>
    );
  }

  return (
    <>
      <PhotoAlbum
        layout="rows"
        targetRowHeight={220}
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

      <Lightbox
        slides={slides}
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        plugins={[Fullscreen, Slideshow, Thumbnails, Zoom]}
      />
    </>
  );
}

export default AllPhotosView;
