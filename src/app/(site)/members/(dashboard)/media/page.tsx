import { isAdminUser } from "@/access";
import { requireMember } from "@/lib/auth";
import { MediaLibrary } from "@/components/members/media/MediaLibrary";
import { getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import { isRaceYearClaimable } from "@/lib/races/catalogue";
import type { RaceClaim } from "@/components/members/races/RaceClaimFields";

export const dynamic = "force-dynamic";

export default async function MembersMediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireMember();
  const params = await searchParams;
  /**
   * The catalogue, not `getRaceEditionOptions`.
   *
   * That function is `startDate exists AND startDate <= today`, which on
   * 2026-09-02 was 14 rows and nothing older than this year — so the upload
   * picker could not name the 2019 UTMB at all. The post editor had the same
   * bug and fixed it the same way; see `RaceClaimFields.tsx`'s header, and
   * `src/endpoints/resolveRaceEdition.ts` for how a claim becomes the
   * `race-editions` id `media.raceEdition` stores.
   */
  const catalogueEvents = await getRaceCatalogueEvents();

  // `?race=<eventKey>&year=<year>` is a hint, not a requirement — same
  // contract as /members/posts/new's `?race=&year=`. A pair that matches
  // nothing just leaves no race preselected.
  //
  // Matched against the catalogue rather than against a list of editions,
  // which is what makes a link to a race nobody has dated work: the edition
  // row need not exist yet, and the resolve endpoint creates it on upload.
  const race = Array.isArray(params.race) ? params.race[0] : params.race;
  const year = Array.isArray(params.year) ? params.year[0] : params.year;
  const event = catalogueEvents.find((candidate) => candidate.id === race);
  const wantedYear = Number(year);
  const preselectedRace: RaceClaim | null =
    event && isRaceYearClaimable(wantedYear, new Date())
      ? { distanceId: "", eventId: event.id, series: event.series, year: wantedYear }
      : null;

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">媒體庫</h1>
      {/*
        The session, resolved here rather than fetched by the client. The
        library needs two things from it: whose rows to offer to filter to,
        and whether to offer that at all — `mediaPublicRead` already scopes a
        non-admin to their own media, so the control would be inert for them.
      */}
      <MediaLibrary
        catalogueEvents={catalogueEvents}
        preselectedRace={preselectedRace}
        isAdmin={isAdminUser(user)}
        userId={user.id}
      />
    </div>
  );
}
