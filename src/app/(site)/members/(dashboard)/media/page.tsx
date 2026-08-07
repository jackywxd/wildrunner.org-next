import { requireMember } from "@/lib/auth";
import { MediaLibrary } from "@/components/members/media/MediaLibrary";
import { getRaceEditionOptions } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function MembersMediaPage() {
  await requireMember();
  const raceEditions = await getRaceEditionOptions(new Date());

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">媒體庫</h1>
      <MediaLibrary raceEditions={raceEditions} />
    </div>
  );
}
