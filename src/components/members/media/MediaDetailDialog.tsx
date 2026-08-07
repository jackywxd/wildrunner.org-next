"use client";

import { useState } from "react";
import Image from "next/image";
import { formatBytes } from "@/lib/direct-upload";
import { mediaImageSrc } from "@/lib/cf-image";
import { Button } from "@/components/ui/button";
import type { Media } from "@/payload-types";
import type { SiteRaceEditionOption } from "@/lib/content-types";

export function MediaDetailDialog({
  item,
  raceEditions,
  onClose,
  onDeleted,
  onUpdated,
}: {
  item: Media;
  /** Server-computed options only — see MediaLibrary.tsx on why this is a prop, not a client fetch. */
  raceEditions: SiteRaceEditionOption[];
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const [alt, setAlt] = useState(item.alt);
  // `depth=0` on the list this dialog is opened from (MediaLibrary.tsx), so
  // `raceEdition` is always a bare id or null here — never a populated doc.
  const [raceEditionId, setRaceEditionId] = useState(
    typeof item.raceEdition === "number" ? String(item.raceEdition) : "",
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "deleting" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  const isVideo = (item.mimeType ?? "").startsWith("video/");
  const src = mediaImageSrc(item);

  async function save() {
    setStatus("saving");
    setError("");
    const res = await fetch(`/api/media/${item.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alt,
        // Always sent, and `null` rather than omitted: picking "不連結比賽"
        // after a race was already set has to clear it, not leave it alone.
        raceEdition: raceEditionId ? Number(raceEditionId) : null,
      }),
    });
    if (!res.ok) {
      setError("儲存失敗");
      setStatus("error");
      return;
    }
    setStatus("idle");
    onUpdated();
  }

  async function remove() {
    setStatus("deleting");
    setError("");
    const res = await fetch(`/api/media/${item.id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) {
      setError("刪除失敗");
      setStatus("error");
      return;
    }
    onDeleted();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        data-testid="media-detail-dialog"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg space-y-4 border border-border bg-background p-6"
      >
        <div className="relative aspect-video bg-secondary">
          {isVideo || !src ? (
            <div className="flex h-full items-center justify-center text-sm text-foreground/40">
              {isVideo ? "▶ 影片" : "圖片處理中"}
            </div>
          ) : (
            <Image
              src={src}
              alt={item.alt}
              fill
              sizes="512px"
              className="object-contain"
            />
          )}
        </div>

        <div className="text-xs text-foreground/50">
          {item.filename} · {item.filesize ? formatBytes(item.filesize) : ""}
        </div>

        <label className="block space-y-1">
          <span className="text-sm">替代文字</span>
          <input
            data-testid="media-detail-alt"
            type="text"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            className="block w-full border border-input bg-background px-3 py-2 text-sm"
          />
        </label>

        {raceEditions.length > 0 && (
          <label className="block space-y-1">
            <span className="text-sm">這張照片是哪一場比賽的</span>
            <select
              data-testid="media-detail-race-edition"
              value={raceEditionId}
              onChange={(e) => setRaceEditionId(e.target.value)}
              className="block w-full border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">不連結比賽</option>
              {raceEditions.map((edition) => (
                <option key={edition.id} value={edition.id}>
                  {edition.year}　{edition.nameZh || edition.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          <div>
            {confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm">確定刪除？</span>
                <Button
                  data-testid="media-detail-delete-confirm"
                  variant="destructive"
                  size="sm"
                  className="justify-center"
                  disabled={status === "deleting"}
                  onClick={remove}
                >
                  刪除
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-center"
                  onClick={() => setConfirmingDelete(false)}
                >
                  取消
                </Button>
              </div>
            ) : (
              <Button
                data-testid="media-detail-delete"
                variant="outline"
                size="sm"
                className="justify-center"
                onClick={() => setConfirmingDelete(true)}
              >
                刪除
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="justify-center" onClick={onClose}>
              關閉
            </Button>
            <Button
              data-testid="media-detail-save"
              className="justify-center"
              disabled={status === "saving"}
              onClick={save}
            >
              儲存
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
