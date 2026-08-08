import React from "react";
import { getPublishedGalleries, getRaceTaggedPhotos } from "@/lib/content";
import GalleryPageClient from "./gallery-page-client";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const [galleries, raceTaggedPhotos] = await Promise.all([
    getPublishedGalleries(),
    getRaceTaggedPhotos(),
  ]);
  return (
    <GalleryPageClient galleries={galleries} raceTaggedPhotos={raceTaggedPhotos} />
  );
}
