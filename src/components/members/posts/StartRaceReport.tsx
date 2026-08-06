"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { RaceChoice } from "@/components/members/posts/RaceChoice";
import { emptyContent } from "@/lib/editor/empty";
import { ensureRaceRecord } from "@/lib/members/race-records";
import { createPost } from "@/lib/members/posts";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";
import type { RaceReportOption } from "@/lib/races/report-options";

/**
 * Turn a race and a distance into a draft the member can start writing.
 *
 * ORDER MATTERS, AND SO DOES WHAT HAPPENS ON FAILURE. The record is created
 * first, then the post that points at it. Reversing them would leave an
 * untitled draft behind whenever the record fails, which is the litter this
 * page exists to avoid by not creating anything on navigation.
 *
 * A record created here with no post after it is a different matter and is
 * fine: it is a badge the member has genuinely earned, it shows up on their
 * profile and on /members/races, and claiming it was never conditional on
 * writing about it.
 */
export function StartRaceReport({
  catalogueEvents,
  options,
  ownerId,
  preselected,
}: {
  catalogueEvents: CatalogueEvent[];
  options: RaceReportOption[];
  ownerId: number;
  preselected?: number;
}) {
  const router = useRouter();

  const [scheduleId, setScheduleId] = useState<number | null>(
    preselected ?? null,
  );
  const [distanceId, setDistanceId] = useState(() => {
    // Auto-picked only when there is nothing to pick. Western States runs
    // 100M and nothing else; making the member confirm that is friction
    // with no decision behind it.
    const chosen = options.find((o) => o.scheduleId === preselected);
    return chosen && chosen.distances.length === 1 ? chosen.distances[0].id : "";
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chosen = options.find((option) => option.scheduleId === scheduleId);

  function chooseRace(next: number | null) {
    setScheduleId(next);
    const option = options.find((o) => o.scheduleId === next);
    setDistanceId(
      option && option.distances.length === 1 ? option.distances[0].id : "",
    );
  }

  async function start() {
    if (!chosen || !distanceId) return;
    setBusy(true);
    setError(null);

    const record = await ensureRaceRecord({
      distanceId,
      eventId: chosen.eventId,
      ownerId,
      year: chosen.year,
    });
    if (!record.ok) {
      setError(record.message);
      setBusy(false);
      return;
    }

    const distanceLabel =
      chosen.distances.find((d) => d.id === distanceId)?.label ?? distanceId;
    const post = await createPost({
      // A real title and slug rather than "未命名文章": the member told us
      // which race this is, so making them retype it would be asking a
      // question we already have the answer to. Both stay editable.
      title: `${chosen.year} ${chosen.label} ${distanceLabel}`,
      slug: `${chosen.year}/${chosen.eventId}-${distanceId}`,
      description: "　",
      content: emptyContent(),
      raceRecord: record.id,
    });

    if (!post.ok) {
      // The slug is the one field that can collide — a member writing a
      // second report about the same finish. Say so plainly instead of
      // showing Payload's "value must be unique".
      setError(
        post.fieldErrors.slug
          ? "這場比賽的賽記已經寫過了，可以到文章列表繼續編輯。"
          : post.message,
      );
      setBusy(false);
      return;
    }

    router.push(`/members/posts/${post.doc.id}`);
  }

  return (
    <div className="space-y-4 border border-border p-4">
      <RaceChoice
        busy={busy}
        catalogueEvents={catalogueEvents}
        distanceId={distanceId}
        onDistance={setDistanceId}
        onRace={chooseRace}
        options={options}
        scheduleId={scheduleId}
      />

      {error && (
        <p className="text-sm text-destructive" data-testid="race-report-error">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          className="justify-center"
          data-testid="race-report-start"
          disabled={busy || !chosen || !distanceId}
          onClick={start}
        >
          {busy ? "建立中…" : "開始撰寫"}
        </Button>
      </div>
    </div>
  );
}
