"use client";

import React from "react";
import type { SiteGallery } from "@/lib/content-types";
import type { RaceFilterOption } from "@/lib/media/gallery-index";
import { MediaGrid } from "@/app/(site)/(public)/gallery/_components/MediaGrid";

/**
 * One album, in the order its curator arranged it.
 *
 * This is what #95 and #102 were for and neither delivered on screen. The
 * migration merged `images` and `videos` into one `galleries_items` with one
 * `_order` because "ordering cannot be expressed across two tables"; #102
 * stopped the mapping splitting them apart again. But this component still
 * drew a video strip and then a photo album, so a curator who arranged video,
 * photo, photo, video still saw video, video, photo, photo. The order existed
 * and nothing rendered it. `MediaGrid` walks `items`.
 *
 * The two-stage seed and the lightbox setup moved there with it — this file
 * had its own copy of both, as did AllPhotosView, as does RacePhotoWall.
 */
export const PhotoGallery: React.FC<{
  gallery: SiteGallery;
  /** Only the races this album's own contents carry — usually none, and
   *  exactly one for a virtual race album, which is why it is often absent. */
  races?: RaceFilterOption[];
}> = ({ gallery, races }) => (
  <MediaGrid
    items={gallery.items}
    musicVideoId={gallery.musicVideoId}
    races={races}
    targetRowHeight={350}
  />
);

export default PhotoGallery;
