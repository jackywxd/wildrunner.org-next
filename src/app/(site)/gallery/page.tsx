import React from "react";
import { getPublishedGalleries } from "@/lib/content";
import GalleryPageClient from "./gallery-page-client";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const galleries = await getPublishedGalleries();
  return <GalleryPageClient galleries={galleries} />;
}
