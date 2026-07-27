import type {
  CollectionAfterChangeHook,
  GlobalAfterChangeHook,
} from "payload";

import {
  revalidateForGallery,
  revalidateForPost,
  revalidatePublicSite,
} from "@/lib/revalidate-public";

export const revalidatePosts: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
}) => {
  revalidateForPost(doc.slug);
  if (previousDoc?.slug && previousDoc.slug !== doc.slug) {
    revalidateForPost(previousDoc.slug);
  }
};

export const revalidateGalleries: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
}) => {
  const videoIds = (doc.videos ?? [])
    .map((row: { videoId?: string | null }) => row.videoId)
    .filter(Boolean) as string[];
  revalidateForGallery(doc.slug, videoIds);
  if (previousDoc?.slug && previousDoc.slug !== doc.slug) {
    const previousVideoIds = (previousDoc.videos ?? [])
      .map((row: { videoId?: string | null }) => row.videoId)
      .filter(Boolean) as string[];
    revalidateForGallery(previousDoc.slug, previousVideoIds);
  }
};

export const revalidateSiteGlobal: GlobalAfterChangeHook = () => {
  revalidatePublicSite();
};
