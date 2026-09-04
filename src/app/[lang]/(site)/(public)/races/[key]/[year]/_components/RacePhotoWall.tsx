"use client";

import { useMemo, useState } from "react";
import Lightbox, { type Slide } from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/plugins/captions.css";
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Slideshow from "yet-another-react-lightbox/plugins/slideshow";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/plugins/thumbnails.css";

import PhotoAlbum from "react-photo-album";
import type { SiteRaceEditionPhoto } from "@/lib/content-types";
import { NextJsImage } from "@/app/[lang]/(site)/(public)/gallery/_components/NextJsImage";

/**
 * One race's photo wall — /gallery/[slug]'s masonry-plus-lightbox pattern
 * (PhotoGallery.tsx), rebuilt on a plain `SiteRaceEditionPhoto[]` instead of
 * `SiteGallery` rather than reusing that component directly. A race's
 * photos are not a gallery: no slug, no per-photo `featured`, no videos.
 * Decoupling `PhotoGallery.tsx` from `SiteGallery` to share this would touch
 * a working, unrelated feature for a second caller that does not need most
 * of what it carries. `NextJsImage` has no such coupling and is reused as
 * is.
 */
export function RacePhotoWall({ photos }: { photos: SiteRaceEditionPhoto[] }) {
  const [index, setIndex] = useState(-1);

  const slides: Slide[] = useMemo(
    () =>
      photos.map((photo) => ({
        src: photo.src,
        width: photo.width,
        height: photo.height,
        /**
         * THIS WAS BEING COMPUTED AND NEVER SHOWN. The `description` slot is
         * rendered by the Captions plugin, which this lightbox did not load,
         * so the string built here went nowhere for as long as the file has
         * existed. Loading the plugin is what makes it appear — a visible
         * change, not a refactor.
         *
         * `media.description` first, because that is somebody writing about
         * the photo; `alt` is the fallback and is a screen-reader description
         * of the picture, which reads oddly as a caption but is better than
         * an unattributed photo. The uploader's name is appended either way.
         */
        description: [photo.description?.trim() || photo.alt, photo.uploaderName]
          .filter(Boolean)
          .join(" · "),
      })),
    [photos],
  );

  if (photos.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="race-photo-wall-empty"
      >
        還沒有這場比賽的照片。
      </p>
    );
  }

  return (
    <div data-testid="race-photo-wall">
      <PhotoAlbum
        layout="rows"
        targetRowHeight={280}
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
        captions={{ showToggle: true, descriptionTextAlign: "start" }}
        plugins={[Captions, Fullscreen, Slideshow, Thumbnails, Zoom]}
      />
    </div>
  );
}

export default RacePhotoWall;
