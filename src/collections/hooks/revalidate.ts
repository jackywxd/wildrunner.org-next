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

/**
 * Authors have no slug/path of their own — their name and bio only reach
 * the public site as the byline baked into each published post page. A
 * plain `afterChange` on Posts can't see this edit, so it's wired here
 * instead: look up every published post this author bylines and
 * revalidate each one.
 */
export const revalidateAuthorPosts: CollectionAfterChangeHook = async ({
  doc,
  req,
}) => {
  const result = await req.payload.find({
    collection: "posts",
    depth: 0,
    limit: 0,
    pagination: false,
    where: {
      and: [
        { author: { equals: doc.id } },
        { _status: { equals: "published" } },
      ],
    },
    overrideAccess: true,
  });

  for (const post of result.docs) {
    revalidateForPost(post.slug as string);
  }
};
