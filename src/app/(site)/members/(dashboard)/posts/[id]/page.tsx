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
 * Returns null for a bare id, which is what depth 0 would give — but this
 * page fetches the post at depth 1 for exactly this reason. The name comes
 * from the catalogue rather than from the schedule row: the record points
 * at an event, not at an edition, and a catalogue rename should follow the
 * badge rather than be pinned to whatever the schedule said that year.
 */
function toLinkedRace(
  catalogue: RaceCatalogueMap,
  value: Post["raceRecord"],
): LinkedRace | null {
  if (!value || typeof value !== "object") return null;
  const record = value as RaceRecord;
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
    // depth: 1 rather than 0, and the difference is confined to `raceRecord`.
    //
    // depth 0 was load-bearing for a reason that has not changed: at any
    // depth every upload node's `value` inside `content` comes back as a
    // populated Media object, and saving that would write an object into a
    // field that must hold a plain id. What makes depth 1 safe here is that
    // the editor no longer round-trips what it loaded — `ContentEditor`
    // parses the Lexical tree and re-serializes it on save, and `savePost`
    // is handed only the fields the form owns. `raceRecord` needs the
    // populated document to draw the badge without a second request.
    post = (await memberFindByID("posts", Number(id), {
      depth: 1,
      draft: true,
    })) as Post;
  } catch {
    notFound();
  }

  const now = new Date();
  const [finishedRaces, catalogueEvents] = await Promise.all([
    getFinishedRaces(now),
    getRaceCatalogueEvents(),
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
        race: toLinkedRace(catalogue, post.raceRecord),
      }}
      ownerId={user.id}
      raceOptions={raceOptions}
    />
  );
}
