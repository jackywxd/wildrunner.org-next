import { isAdminUser } from "@/access";
import { requireMember } from "@/lib/auth";
import { memberFind } from "@/lib/members/data";
import { getPayloadClient } from "@/lib/payload";
import { RaceRecordManager } from "@/components/members/races/RaceRecordManager";
import { UltraSignupAliasReview } from "@/components/members/races/UltraSignupAliasReview";
import type { ImportMember } from "@/components/members/races/UltraSignupForMember";
import { getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import type { RaceCatalogueRequest, RaceRecord, User } from "@/payload-types";

export const dynamic = "force-dynamic";

/**
 * `memberFind` rather than a bare `payload.find`: it is the members area's
 * only read entry point, pinning `overrideAccess: false` and redundantly
 * scoping to the owner. That matters more here than elsewhere, because this
 * collection's read access is deliberately public — a plain query would
 * cheerfully return every member's records.
 *
 * An admin also gets every account, to import UltraSignup results for one
 * of them, and the alias review. The list is read as the admin with access
 * enforced — `users` read is admin-or-self, so for anyone else it would be
 * their own row, and it is not asked for at all.
 */
export default async function MemberRacesPage() {
  const user = await requireMember();
  const [result, catalogueEvents, requestResult] = await Promise.all([
    memberFind("race-records", {
      depth: 0,
      limit: 500,
      sort: "-year",
    }),
    getRaceCatalogueEvents(),
    // Newest first: the import list shows the latest request per row.
    memberFind("race-catalogue-requests", {
      depth: 0,
      limit: 500,
      select: { adminNote: true, raceDate: true, status: true, ultrasignupTitle: true },
      sort: "-createdAt",
    }),
  ]);

  const members = isAdminUser(user) ? await importMembers(user) : undefined;

  const records = (result.docs as RaceRecord[]).map((doc) => ({
    distanceId: doc.distanceId,
    eventId: doc.eventId,
    finishSeconds: doc.finishSeconds,
    id: doc.id,
    result: doc.result,
    ultrasignupDate: doc.ultrasignupDate,
    ultrasignupTitle: doc.ultrasignupTitle,
    year: doc.year,
  }));

  const catalogueRequests = (requestResult.docs as RaceCatalogueRequest[]).map((doc) => ({
    adminNote: doc.adminNote,
    id: doc.id,
    raceDate: doc.raceDate,
    status: doc.status,
    ultrasignupTitle: doc.ultrasignupTitle,
  }));

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-semibold">比賽紀錄</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        登錄你跑過的 UTMB World Series、World Trail
        Majors、六大馬拉松與其他獨立賽事，徽章會出現在成員名錄和你的個人頁上。
        未完賽也可以登錄，徽章會以灰階顯示。六大馬拉松六場都「完賽」之後，會多一面
        「六大馬拉松」徽章，年份是你完成第六場的那一年。
      </p>
      <RaceRecordManager
        catalogueEvents={catalogueEvents}
        catalogueRequests={catalogueRequests}
        members={members}
        records={records}
        ultrasignupName={user.ultrasignupName ?? ""}
        userId={user.id}
      />
      {members && (
        <div className="mt-8">
          <UltraSignupAliasReview />
        </div>
      )}
    </div>
  );
}

async function importMembers(user: User): Promise<ImportMember[]> {
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "users",
    depth: 0,
    limit: 0,
    overrideAccess: false,
    pagination: false,
    select: { displayName: true, email: true, ultrasignupName: true },
    sort: "email",
    user,
  });
  return (docs as Pick<User, "displayName" | "email" | "id" | "ultrasignupName">[]).map((doc) => ({
    id: doc.id,
    label: doc.displayName ? `${doc.displayName}（${doc.email}）` : doc.email,
    ultrasignupName: doc.ultrasignupName ?? "",
  }));
}
