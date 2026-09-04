import { memberFind } from "@/lib/members/data";
import { RaceRecordManager } from "@/components/members/races/RaceRecordManager";
import { getRaceCatalogueEvents } from "@/lib/races/catalogue-db";
import type { RaceRecord } from "@/payload-types";

export const dynamic = "force-dynamic";

/**
 * `memberFind` rather than a bare `payload.find`: it is the members area's
 * only read entry point, pinning `overrideAccess: false` and redundantly
 * scoping to the owner. That matters more here than elsewhere, because this
 * collection's read access is deliberately public — a plain query would
 * cheerfully return every member's records.
 */
export default async function MemberRacesPage() {
  const [result, catalogueEvents] = await Promise.all([
    memberFind("race-records", {
      depth: 0,
      limit: 500,
      sort: "-year",
    }),
    getRaceCatalogueEvents(),
  ]);

  const records = (result.docs as RaceRecord[]).map((doc) => ({
    distanceId: doc.distanceId,
    eventId: doc.eventId,
    id: doc.id,
    year: doc.year,
  }));

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-semibold">比賽紀錄</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        登錄你完賽過的 UTMB World Series、World Trail
        Majors、六大馬拉松與其他獨立賽事，徽章會出現在成員名錄和你的個人頁上。
        六大馬拉松六場都登錄之後，會多一面「六大馬拉松」徽章，年份是你完成第六場的那一年。
      </p>
      <RaceRecordManager catalogueEvents={catalogueEvents} records={records} />
    </div>
  );
}
