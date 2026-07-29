import type { CollectionSlug, SelectType, Sort, Where } from "payload";

import { getPayloadClient } from "@/lib/payload";
import { requireMember } from "@/lib/auth";

/**
 * The only place the members area is allowed to read data through. Local
 * API defaults to `overrideAccess: true`, and `ownedOnlyPublicRead` (Media,
 * Authors) returns `true` for an anonymous caller — so every call here
 * pins `overrideAccess: false` *and* redundantly ANDs `where.owner`, per
 * src/access/index.ts's "either layer alone is a hole" note.
 */

type MemberFindOptions = {
  depth?: number;
  draft?: boolean;
  limit?: number;
  page?: number;
  select?: SelectType;
  sort?: Sort;
  where?: Where;
};

export async function memberFind<TSlug extends CollectionSlug>(
  collection: TSlug,
  opts: MemberFindOptions = {}
) {
  const user = await requireMember();
  const payload = await getPayloadClient();

  const ownerScope: Where = { owner: { equals: user.id } };

  return payload.find({
    collection,
    overrideAccess: false,
    user,
    depth: opts.depth ?? 0,
    draft: opts.draft,
    limit: opts.limit,
    page: opts.page,
    select: opts.select,
    sort: opts.sort,
    where: opts.where ? { and: [ownerScope, opts.where] } : ownerScope,
  });
}

type MemberFindByIDOptions = {
  depth?: number;
  draft?: boolean;
};

export async function memberFindByID<TSlug extends CollectionSlug>(
  collection: TSlug,
  id: number | string,
  opts: MemberFindByIDOptions = {}
) {
  const user = await requireMember();
  const payload = await getPayloadClient();

  const doc = await payload.findByID({
    collection,
    id,
    overrideAccess: false,
    user,
    depth: opts.depth ?? 0,
    draft: opts.draft,
  });

  const owner = (doc as { owner?: number | { id: number } | null }).owner;
  const ownerId = typeof owner === "object" && owner !== null ? owner.id : owner;
  if (ownerId !== user.id) {
    throw new Error(`Owner mismatch on ${collection}/${id}`);
  }

  return doc;
}
