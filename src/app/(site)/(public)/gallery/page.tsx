import React from "react";
import {
  getPublishedGalleries,
  getRaceTaggedPhotos,
  getRaceTaggedVideos,
} from "@/lib/content";
import GalleryPageClient from "./gallery-page-client";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const [galleries, raceTaggedPhotos, raceTaggedVideos] = await Promise.all([
    getPublishedGalleries(),
    getRaceTaggedPhotos(),
    getRaceTaggedVideos(),
  ]);
  return (
    <GalleryPageClient
      galleries={galleries}
      raceTaggedPhotos={raceTaggedPhotos}
      raceTaggedVideos={raceTaggedVideos}
    />
  );
}
