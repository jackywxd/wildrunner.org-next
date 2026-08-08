import { requireMember } from "@/lib/auth";
import { MediaLibrary } from "@/components/members/media/MediaLibrary";
import { getRaceEditionOptions } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function MembersMediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMember();
  const params = await searchParams;
  const raceEditions = await getRaceEditionOptions(new Date());

  // `?race=<eventKey>&year=` is a hint, not a requirement — same contract
  // as /members/posts/new's `?race=&year=` preselection. A pair that
  // matches nothing just leaves no race preselected.
  const race = Array.isArray(params.race) ? params.race[0] : params.race;
  const year = Array.isArray(params.year) ? params.year[0] : params.year;
  const preselected = raceEditions.find(
    (edition) => edition.eventKey === race && String(edition.year) === year,
  );

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">媒體庫</h1>
      <MediaLibrary
        preselectedRaceEditionId={preselected?.id}
        raceEditions={raceEditions}
      />
    </div>
  );
}
