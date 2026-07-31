import type {
  CollectionAfterChangeHook,
  GlobalAfterChangeHook,
} from "payload";

import {
  revalidateForGallery,
  revalidateForPost,
  revalidateForRider,
  revalidatePublicSite,
} from "@/lib/revalidate-public";

/**
 * `doc.author` arrives either as an id or as a populated object, depending on
 * the depth of the request that triggered the hook — so both the identity
 * comparison and the slug lookup have to normalise first.
 */
const authorId = (author: unknown): number | string | null => {
  if (typeof author === "number" || typeof author === "string") return author;
  if (author && typeof author === "object" && "id" in author) {
    return (author as { id: number | string }).id;
  }
  return null;
};

/** Resolve an author id (or already-populated author) to its public slug. */
const authorSlug = async (
  author: unknown,
  req: Parameters<CollectionAfterChangeHook>[0]["req"],
): Promise<string | null> => {
  if (author && typeof author === "object" && "slug" in author) {
    return (author as { slug?: string }).slug ?? null;
  }

  const id = authorId(author);
  if (id === null) return null;

  try {
    const doc = await req.payload.findByID({
      collection: "authors",
      id,
      depth: 0,
      overrideAccess: true,
    });
    return (doc?.slug as string) ?? null;
  } catch {
    // A missing author must not fail the write that triggered this.
    return null;
  }
};

export const revalidatePosts: CollectionAfterChangeHook = async (args) => {
  const { doc, previousDoc, req } = args;
  revalidateForPost(doc.slug);
  if (previousDoc?.slug && previousDoc.slug !== doc.slug) {
    revalidateForPost(previousDoc.slug);
  }

  // The byline's own page lists this post and counts it, so publishing,
  // unpublishing or re-assigning changes it too. Both sides when the byline
  // moved, or the post lingers on the old rider's page.
  const bylineMoved =
    previousDoc?.author != null &&
    authorId(previousDoc.author) !== authorId(doc.author);

  const slugs = new Set(
    (
      await Promise.all([
        authorSlug(doc.author, req),
        bylineMoved ? authorSlug(previousDoc.author, req) : Promise.resolve(null),
      ])
    ).filter((s): s is string => Boolean(s)),
  );
  for (const slug of slugs) {
    revalidateForRider(slug);
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
 * An author edit reaches the public site in three places: the byline baked
 * into each published post page, the rider directory, and that rider's own
 * page. A plain `afterChange` on Posts can't see this edit, so it's wired
 * here — `revalidateForRider` covers the last two, and every bylined post is
 * revalidated individually below.
 *
 * The old slug matters too: `/riders/<old>` stays cached and reachable
 * otherwise.
 */
export const revalidateAuthorPosts: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  revalidateForRider(doc.slug as string);
  if (previousDoc?.slug && previousDoc.slug !== doc.slug) {
    revalidateForRider(previousDoc.slug as string);
  }

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
