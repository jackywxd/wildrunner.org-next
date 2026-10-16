"use client";

import { useEffect, useState } from "react";

import { UltraSignupImport } from "@/components/members/races/UltraSignupImport";
import { FieldLabel } from "@/components/ui/input";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";
import type { LoggedRecord } from "@/lib/ultrasignup/row-state";

/** A member an admin can import for, as the races page lists them. */
export type ImportMember = {
  id: number;
  label: string;
  ultrasignupName: string;
};

/**
 * The admin's choice of whose results the UltraSignup list imports.
 *
 * "Myself" is the ordinary member list, unchanged. A member swaps in a
 * second list keyed on that member, so nothing — the name, the person
 * picked, a half-placed row — carries over from one member to the next.
 * Only one list is ever on the page: two would share every test id and,
 * worse, every radio group name.
 *
 * The member's records are read when they are picked, not sent with the
 * page: which rows are already logged is a question about *their* list,
 * and an import here changes it.
 */
export function UltraSignupOwnerPicker({
  catalogueEvents,
  members,
  own,
  userId,
}: {
  catalogueEvents: CatalogueEvent[];
  members: ImportMember[];
  /** The admin's own list, shown while "myself" is picked. */
  own: React.ReactNode;
  userId: number;
}) {
  const [memberId, setMemberId] = useState<number | null>(null);
  const member = members.find((item) => item.id === memberId) ?? null;

  return (
    <div className="space-y-3">
      <label className="block space-y-1 border border-dashed border-border p-3">
        <FieldLabel>管理員：匯入給</FieldLabel>
        <select
          className="block w-full border border-input bg-background px-3 py-2 text-base md:text-sm"
          data-testid="ultrasignup-owner"
          onChange={(event) => setMemberId(event.target.value ? Number(event.target.value) : null)}
          value={memberId ?? ""}
        >
          <option value="">自己</option>
          {members
            .filter((item) => item.id !== userId)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
        </select>
      </label>
      {member ? (
        <MemberImport
          catalogueEvents={catalogueEvents}
          key={member.id}
          member={member}
          userId={userId}
        />
      ) : (
        own
      )}
    </div>
  );
}

function MemberImport({
  catalogueEvents,
  member,
  userId,
}: {
  catalogueEvents: CatalogueEvent[];
  member: ImportMember;
  userId: number;
}) {
  const [records, setRecords] = useState<LoggedRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const query = new URLSearchParams({
      depth: "0",
      limit: "500",
      "where[owner][equals]": String(member.id),
    });
    fetch(`/api/race-records?${query}`, { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { docs: LoggedRecord[] };
        if (current) setRecords(body.docs);
      })
      .catch(() => {
        if (current) setError("讀不到這位會員的比賽紀錄，請重新整理後再試。");
      });
    return () => {
      current = false;
    };
  }, [member.id]);

  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }
  if (!records) return <p className="text-sm text-muted-foreground">讀取會員的比賽紀錄…</p>;
  return (
    <UltraSignupImport
      admin
      catalogueEvents={catalogueEvents}
      initialName={member.ultrasignupName}
      initialRequests={[]}
      onImported={(record) =>
        setRecords((list) => [...(list ?? []).filter((item) => item.id !== record.id), record])
      }
      ownerId={member.id}
      records={records}
      userId={userId}
    />
  );
}
