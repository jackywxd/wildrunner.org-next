import React from "react";
import {
  getPublishedGalleries,
  getRaceGalleries,
  getRaceTaggedPhotos,
  getRaceTaggedVideos,
} from "@/lib/content";
import GalleryPageClient from "./gallery-page-client";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const [galleries, raceGalleries, raceTaggedPhotos, raceTaggedVideos] =
    await Promise.all([
      getPublishedGalleries(),
      getRaceGalleries(new Date()),
      getRaceTaggedPhotos(),
      getRaceTaggedVideos(),
    ]);
  // Merged rather than rendered separately: the albums shelf is already
  // generic over SiteGallery, and `allPhotos` dedupes by src, so a photo
  // that is both in a curated album and tagged with a race still appears
  // once. Sorting by `created` interleaves them by date, which is what a
  // reader expects from one shelf.
  return (
    <GalleryPageClient
      galleries={[...galleries, ...raceGalleries]}
      raceTaggedPhotos={raceTaggedPhotos}
      raceTaggedVideos={raceTaggedVideos}
    />
  );
}
