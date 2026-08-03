import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from "payload";

import {
  revalidateForGallery,
  revalidateForPost,
  revalidateForRaceSchedule,
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

/**
 * Resolve a race record's `owner` (a *user* id) to that member's public
 * rider slug.
 *
 * Deliberately not `authorSlug`: that takes an author id, and a race record
 * points at the account, not the byline. The two are one-to-one via
 * `ensureAuthorIdentity`, but the lookup direction is the other way round —
 * find the author whose `owner` is this user.
 */
const riderSlugForOwner = async (
  owner: unknown,
  req: Parameters<CollectionAfterChangeHook>[0]["req"],
): Promise<string | null> => {
  const id = authorId(owner);
  if (id === null) return null;

  try {
    const result = await req.payload.find({
      collection: "authors",
      depth: 0,
      limit: 1,
      pagination: false,
      where: { owner: { equals: id } },
      overrideAccess: true,
      req,
    });
    return (result.docs[0]?.slug as string) ?? null;
  } catch {
    // A missing author must not fail the write that triggered this.
    return null;
  }
};

/**
 * A race record only ever shows on rider pages, so those are the only paths
 * that need busting — `revalidateForRider` already covers `/riders` itself,
 * where the member's card carries the same badges.
 */
export const revalidateRaceRecord = {
  afterChange: (async ({ doc, previousDoc, req }) => {
    const slugs = new Set(
      (
        await Promise.all([
          riderSlugForOwner(doc.owner, req),
          // An admin reassigning a record has to clear the old profile too,
          // or the badge lingers on a member who no longer claims it.
          previousDoc?.owner && authorId(previousDoc.owner) !== authorId(doc.owner)
            ? riderSlugForOwner(previousDoc.owner, req)
            : Promise.resolve(null),
        ])
      ).filter((slug): slug is string => Boolean(slug)),
    );

    for (const slug of slugs) revalidateForRider(slug);
  }) as CollectionAfterChangeHook,

  afterDelete: (async ({ doc, req }) => {
    revalidateForRider(await riderSlugForOwner(doc.owner, req));
  }) as CollectionAfterDeleteHook,
};

/**
 * Far simpler than `revalidateRaceRecord`: a schedule row has no owner and
 * no per-rider page, so there is nothing to resolve — the same two paths
 * are busted whatever changed.
 */
export const revalidateRaceSchedule = {
  afterChange: (() => {
    revalidateForRaceSchedule();
  }) as CollectionAfterChangeHook,

  afterDelete: (() => {
    revalidateForRaceSchedule();
  }) as CollectionAfterDeleteHook,
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
