"use client";

import { useCallback, useEffect, useState } from "react";
import { QuotaBar } from "./QuotaBar";
import { UploadDropzone } from "./UploadDropzone";
import { MediaGrid } from "./MediaGrid";
import { MediaDetailDialog } from "./MediaDetailDialog";
import type { Media } from "@/payload-types";
import type { SiteRaceEditionOption } from "@/lib/content-types";

type Usage = { quotaBytes: number; usedBytes: number };

export function MediaLibrary({
  raceEditions,
}: {
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

  return (
    <div className="space-y-6">
      {usage && <QuotaBar usedBytes={usage.usedBytes} quotaBytes={usage.quotaBytes} />}

      <UploadDropzone onUploaded={refresh} raceEditions={raceEditions} />

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
