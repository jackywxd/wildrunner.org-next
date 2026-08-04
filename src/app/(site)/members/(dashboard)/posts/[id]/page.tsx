import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { memberFind, memberFindByID } from "@/lib/members/data";
import { findRaceDistance, findRaceEvent } from "@/lib/races/catalogue";
import { PostEditor } from "@/components/members/posts/PostEditor";
import { emptyContent } from "@/lib/editor/empty";
import type { PayloadContent } from "@/lib/editor/serialize";
import type { Post, RaceRecord } from "@/payload-types";

export const dynamic = "force-dynamic";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireMember();
  const { id } = await params;

  let post: Post;
  try {
    // depth: 0 is load-bearing — at depth >= 1 every upload node's `value`
    // comes back as a populated Media object, and saving that would write
    // an object into a field that must hold a plain id.
    post = (await memberFindByID("posts", Number(id), {
      depth: 0,
      draft: true,
    })) as Post;
  } catch {
    notFound();
  }

  // The member's own finishes, as picker options. Scoped by memberFind
  // rather than by a where clause written here — race-records is publicly
  // readable, so the scoping has to come from the helper that always
  // applies it.
  const records = await memberFind("race-records", { depth: 0, limit: 0 });
  const raceOptions = (records.docs as RaceRecord[])
    .map((record) => {
      const event = findRaceEvent(record.eventId);
      const distance = event
        ? findRaceDistance(event, record.distanceId)
        : undefined;
      // Falls back to the stored ids rather than hiding the option: a
      // record whose event was renamed out of the catalogue is still the
      // member's, and dropping it from the list would look like data loss.
      return {
        id: record.id,
        label: `${record.year} ${event?.name ?? record.eventId} · ${
          distance?.label ?? record.distanceId
        }`,
      };
    })
    .sort((a, b) => b.label.localeCompare(a.label));

  return (
    <PostEditor
      initial={{
        id: post.id,
        title: post.title ?? "",
        slug: post.slug ?? "",
        description: post.description ?? "",
        raceOptions,
        raceRecord:
          typeof post.raceRecord === "number"
            ? post.raceRecord
            : (post.raceRecord?.id ?? null),
        status: post._status === "published" ? "published" : "draft",
        content: (post.content as unknown as PayloadContent) ?? emptyContent(),
      }}
    />
  );
}
