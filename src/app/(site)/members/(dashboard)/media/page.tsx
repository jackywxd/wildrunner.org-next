import { requireMember } from "@/lib/auth";
import { MediaLibrary } from "@/components/members/media/MediaLibrary";

export const dynamic = "force-dynamic";

export default async function MembersMediaPage() {
  await requireMember();

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">媒體庫</h1>
      <MediaLibrary />
    </div>
  );
}
