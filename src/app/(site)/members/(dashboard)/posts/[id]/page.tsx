import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { memberFindByID } from "@/lib/members/data";
import { PostEditor } from "@/components/members/posts/PostEditor";
import type { LinkedRace } from "@/components/members/posts/RaceRecordField";
import { emptyContent } from "@/lib/editor/empty";
import type { PayloadContent } from "@/lib/editor/serialize";
import { getFinishedRaces } from "@/lib/content";
import { resolveBadgeEvent } from "@/lib/races/badge-source";
import { catalogueMap, getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import type { RaceCatalogueMap } from "@/lib/races/catalogue-db";
import { reportOptions } from "@/lib/races/report-options";
import type { Post, RaceRecord } from "@/payload-types";

export const dynamic = "force-dynamic";

/**
 * The stored record, as the editor's badge needs it.
 *
 * Takes the record fetched separately by the caller — `post.raceRecord`
 * itself is a bare id (the post is fetched at depth 0). The name comes from
 * the catalogue rather than from the schedule row: the record points at an
 * event, not at an edition, and a catalogue rename should follow the badge
 * rather than be pinned to whatever the schedule said that year.
 */
function toLinkedRace(
  catalogue: RaceCatalogueMap,
  record: RaceRecord | null,
): LinkedRace | null {
  if (!record) return null;
  return {
    distanceId: record.distanceId,
    eventId: record.eventId,
    label: resolveBadgeEvent(catalogue, record.eventId).name,
    recordId: record.id,
    year: record.year,
  };
}

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireMember();
  const { id } = await params;

  let post: Post;
  try {
    // depth: 0, not 1. `ebb48d3` switched this to depth: 1 on the theory
    // that the difference is confined to `raceRecord`, and that the editor
    // is safe from the populated-object problem because it re-serializes
    // rather than round-tripping what it loaded. Both halves of that were
    // wrong: Payload's own `UploadFeature` registers a REST/local-API
    // `afterRead` node hook (@payloadcms/richtext-lexical/dist/features/
    // upload/server/index.js) that walks *every* node in `content` and
    // replaces `value` with the full populated Media document whenever
    // `depth >= 1` — not just GraphQL, and not just `raceRecord`. That
    // object then becomes the *initial* Lexical editor state
    // (`ContentEditor`'s `fromPayloadContent(initialContent)`), so every
    // image in an existing post's body rendered `UploadPreview` with an
    // object instead of an id, and its fallback branch stringified that
    // object into the literal text "媒體 #[object Object]" — reported
    // 2026-08-18 on a real published post. `raceRecord` is fetched
    // separately below instead.
    post = (await memberFindByID("posts", Number(id), {
      depth: 0,
      draft: true,
    })) as Post;
  } catch {
    notFound();
  }

  const now = new Date();
  const [finishedRaces, catalogueEvents, raceRecord] = await Promise.all([
    getFinishedRaces(now),
    getRaceCatalogueEvents(),
    // `raceRecord`'s own fields (`eventId`, `distanceId`, `year`) are plain
    // scalars, not relationships, so depth 0 already returns everything
    // `toLinkedRace` needs — this fetch exists only because depth 0 on the
    // post above leaves `post.raceRecord` as a bare id.
    typeof post.raceRecord === "number"
      ? memberFindByID("race-records", post.raceRecord, { depth: 0 })
      : null,
  ]);
  const catalogue = catalogueMap(catalogueEvents);
  const raceOptions = reportOptions(catalogue, finishedRaces, now);

  return (
    <PostEditor
      catalogueEvents={catalogueEvents}
      initial={{
        id: post.id,
        title: post.title ?? "",
        slug: post.slug ?? "",
        description: post.description ?? "",
        status: post._status === "published" ? "published" : "draft",
        content: (post.content as unknown as PayloadContent) ?? emptyContent(),
        race: toLinkedRace(catalogue, raceRecord as RaceRecord | null),
      }}
      ownerId={user.id}
      raceOptions={raceOptions}
    />
  );
}
