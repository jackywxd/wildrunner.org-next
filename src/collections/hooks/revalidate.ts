import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from "payload";

import { publicMediaFieldsChanged } from "@/lib/media/public-fields";
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

/**
 * No video ids any more, and their absence is a fix rather than a loss.
 *
 * This used to read `doc.videos[].videoId` and pass the result on so that
 * `/gallery/<slug>/v/<videoId>` was busted too. `galleries.videos` stopped
 * existing when #95 merged the two arrays into `items`, and `videoId` moved to
 * `media.legacyVideoId` in the same change — so `doc.videos ?? []` had been
 * evaluating to `[]` on every save since, quietly, with the ids nowhere in
 * reach of a hook that only has the gallery document.
 *
 * It cost nothing, because those share pages are `force-dynamic` and nothing
 * revalidates a route that is never cached. Rebuilding it would therefore mean
 * adding a query per album save to feed a no-op. What matters is that it is
 * gone rather than looking like coverage: if those pages are ever cached, the
 * ids live on the media rows now and fetching them is the work to do.
 */
export const revalidateGalleries: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
}) => {
  revalidateForGallery(doc.slug);
  if (previousDoc?.slug && previousDoc.slug !== doc.slug) {
    revalidateForGallery(previousDoc.slug);
  }
};

/**
 * `media` had no revalidation hook at all, and only `/gallery` being
 * `force-dynamic` hid it: a member unticking 顯示在相片牆 took effect on the
 * next request because the page was rebuilt on every request. The moment that
 * page is cached, the same untick stops taking effect until something else
 * happens to bust the path.
 *
 * Which is why this lands before the caching does, and why the rule is worth
 * saying out loud: **publishing may lag, un-publishing may not.** A photo that
 * takes a minute to appear is an inconvenience; a photo that stays up after
 * its owner removed it is not the same kind of thing.
 *
 * `revalidatePublicSite()` rather than a narrower path list, because every one
 * of STATIC_PATHS can render a media row — `/posts` and `/` through post
 * covers, `/riders` through author avatars, `/about` through the site global,
 * `/gallery` through the wall itself. The breadth is affordable precisely
 * because `publicMediaFieldsChanged` keeps the sweeps out.
 */
export const revalidateMedia = {
  afterChange: (({ doc, previousDoc }) => {
    if (!publicMediaFieldsChanged(doc, previousDoc)) return;
    revalidatePublicSite();
  }) as CollectionAfterChangeHook,

  // No field check on delete: the row is gone, so whatever it was showing is
  // gone with it.
  afterDelete: (() => {
    revalidatePublicSite();
  }) as CollectionAfterDeleteHook,
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
