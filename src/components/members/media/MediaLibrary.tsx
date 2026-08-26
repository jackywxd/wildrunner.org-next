"use client";

import { useCallback, useEffect, useState } from "react";
import { QuotaBar } from "./QuotaBar";
import { UploadDropzone } from "./UploadDropzone";
import { MediaGrid } from "./MediaGrid";
import { MediaDetailDialog } from "./MediaDetailDialog";
import { transcodeBadge } from "./TranscodeBadge";
import type { Media } from "@/payload-types";
import type { SiteRaceEditionOption } from "@/lib/content-types";

type Usage = { quotaBytes: number; usedBytes: number };

/**
 * Fifteen seconds. A 4K clip measured ~2.6 minutes of encoding plus
 * transfer, so this is roughly a dozen polls over a whole job — cheap
 * against a `/api/media` list, and short enough that the badge clearing
 * still reads as a response to something rather than an unrelated event.
 */
const TRANSCODE_POLL_MS = 15_000;

export function MediaLibrary({
  preselectedRaceEditionId,
  raceEditions,
}: {
  /** From a 上傳相片-style deep link — a hint, not a requirement. */
  preselectedRaceEditionId?: number;
  raceEditions: SiteRaceEditionOption[];
}) {
  const [items, setItems] = useState<Media[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [selected, setSelected] = useState<Media | null>(null);
  const [loading, setLoading] = useState(true);

  // `cache: "no-store"` as well as the no-store response header: this list
  // has to reflect an upload that happened a moment ago, and a response
  // already sitting in the browser's HTTP cache would be replayed
  // regardless of what the server now says.
  const refresh = useCallback(async () => {
    const [mediaRes, usageRes] = await Promise.all([
      fetch("/api/media?limit=100&sort=-createdAt&depth=0", {
        credentials: "same-origin",
        cache: "no-store",
      }),
      fetch("/api/members/storage-usage", {
        credentials: "same-origin",
        cache: "no-store",
      }),
    ]);
    if (mediaRes.ok) {
      const body = (await mediaRes.json()) as { docs: Media[] };
      setItems(body.docs);
    }
    if (usageRes.ok) {
      setUsage((await usageRes.json()) as Usage);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A transcode finishes minutes after the upload does, in a container, by
  // patching the row — nothing pushes that back to this page. Without a poll
  // the member watches 轉檔中 forever and reloads to find out, which undoes
  // the reason the encode was made asynchronous in the first place.
  //
  // Keyed on the boolean, not on `items`: the effect then re-runs only when
  // the answer actually flips, and an interval rather than a chained timeout
  // means one failed request does not silently end the polling — the next
  // tick still fires. It stops on its own once nothing is in flight.
  const transcodePending = items.some((item) => transcodeBadge(item)?.tone === "pending");

  useEffect(() => {
    if (!transcodePending) return;
    const timer = setInterval(refresh, TRANSCODE_POLL_MS);
    return () => clearInterval(timer);
  }, [transcodePending, refresh]);

  return (
    <div className="space-y-6">
      {usage && <QuotaBar usedBytes={usage.usedBytes} quotaBytes={usage.quotaBytes} />}

      <UploadDropzone
        onUploaded={refresh}
        preselectedRaceEditionId={preselectedRaceEditionId}
        raceEditions={raceEditions}
      />

      {!loading && <MediaGrid items={items} onSelect={setSelected} />}

      {selected && (
        <MediaDetailDialog
          item={selected}
          raceEditions={raceEditions}
          onClose={() => setSelected(null)}
          onUpdated={() => {
            setSelected(null);
            refresh();
          }}
          onDeleted={() => {
            setSelected(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
