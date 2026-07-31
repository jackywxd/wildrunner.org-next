import { memberFind } from "@/lib/members/data";
import { RaceRecordManager } from "@/components/members/races/RaceRecordManager";
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
  const result = await memberFind("race-records", {
    depth: 0,
    limit: 500,
    sort: "-year",
  });

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
        登錄你完賽過的 UTMB World Series 與 World Trail Majors
        賽事，徽章會出現在成員名錄和你的個人頁上。
      </p>
      <RaceRecordManager records={records} />
    </div>
  );
}
