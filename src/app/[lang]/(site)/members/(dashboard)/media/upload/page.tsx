import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requireMember } from "@/lib/auth";
import { UploadPanel } from "@/components/members/media/UploadPanel";
import { getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import { preselectedRaceFrom } from "@/lib/members/race-preselect";

export const dynamic = "force-dynamic";

/**
 * Uploading, on its own page.
 *
 * It used to be a strip above the library grid, and the two were competing for
 * one screen: the uploader was squeezed down to a bare `<input type="file">`,
 * which is why a control that supports multi-select, drag and drop, race
 * tagging, resume and de-duplication described none of it. Splitting them
 * gives each the room to say what it does — see `UploadPanel`'s header for the
 * four states this page now has.
 *
 * `requireMember` and nothing else from the session: unlike the library, this
 * page offers no admin-only control, so it needs neither the user's id nor
 * their role.
 */
export default async function MembersMediaUploadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMember();
  const params = await searchParams;
  const catalogueEvents = await getRaceCatalogueEvents();

  return (
    <div className="max-w-3xl space-y-5">
      <div className="space-y-2">
        <Link
          href="/members/media"
          data-testid="media-upload-back"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          回媒體庫
        </Link>
        <h1 className="font-heading text-2xl font-semibold">上傳照片和影片</h1>
      </div>

      <UploadPanel
        catalogueEvents={catalogueEvents}
        preselectedRace={preselectedRaceFrom(params, catalogueEvents, new Date())}
      />
    </div>
  );
}
