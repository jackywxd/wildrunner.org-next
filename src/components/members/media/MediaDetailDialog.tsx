"use client";

import { useState } from "react";
import Image from "next/image";
import { formatBytes } from "@/lib/direct-upload";
import { mediaImageSrc } from "@/lib/cf-image";
import { Button } from "@/components/ui/button";
import { StreamVideoPlayer } from "@/components/stream-video-player";
import type { Media } from "@/payload-types";
import { transcodeNote } from "@/lib/media/transcode-copy";
import type { SiteRaceEditionOption, SiteVideo } from "@/lib/content-types";

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
  // `usage` is a three-value column but only two of them are a member's to
  // choose between: 'gallery' and 'private'. The third, 'attachment', is set
  // by the editor's own upload path and shown below as a note rather than a
  // state this control can return to — a member ticking the box is saying
  // "put this on the wall", which makes it library content from then on.
  const [showOnWall, setShowOnWall] = useState(item.usage === "gallery");
  const wasAttachment = item.usage === "attachment";
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "saving" | "deleting" | "retrying" | "error"
  >("idle");
  const [error, setError] = useState("");

  const isVideo = (item.mimeType ?? "").startsWith("video/");
  const src = mediaImageSrc(item);
  // Built inline rather than importing content.ts's mapGalleryVideo: that
  // file resolves the payload client at module scope, which has no place
  // in a client bundle. mediaImageSrc is the one part of that mapping this
  // component already needed anyway.
  const video: SiteVideo | null =
    isVideo && src
      ? {
          mediaId: item.id,
          id: item.filename ?? String(item.id),
          filename: item.filename ?? "video",
          src,
          slug: item.filename ?? String(item.id),
          mimeType: item.mimeType ?? "video/mp4",
          size: item.filesize ?? undefined,
          extension: item.filename?.includes(".")
            ? item.filename.split(".").pop()
            : undefined,
          streamId: item.streamId,
          streamReady: Boolean(item.streamReady),
        }
      : null;

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
        // Always sent for the same reason: unticking has to write 'private',
        // not leave the previous value in place.
        usage: showOnWall ? "gallery" : "private",
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

  // Reuses the same endpoint the upload flow calls — `nextStatusForRequest`
  // already treats a `failed` row as retryable, returning it to `queued`
  // (transcode-state.ts, U-TRANSCODE-2). What was missing was a way for a
  // member to ask for it without re-uploading the same file, which this
  // session's own repeated manual re-uploads made obvious was needed now
  // rather than later.
  //
  // Unlike `requestTranscode()` (used right after upload), this does NOT
  // swallow a failed request: the member explicitly asked for this action,
  // so a transcoder that is unreachable has to say so rather than look like
  // nothing happened.
  async function retry() {
    setStatus("retrying");
    setError("");
    const res = await fetch(`/api/members/media/${item.id}/transcode`, {
      method: "POST",
      credentials: "same-origin",
    });
    if (!res.ok) {
      setError("重新轉檔失敗，請稍後再試");
      setStatus("error");
      return;
    }
    onUpdated();
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
          {video ? (
            <StreamVideoPlayer video={video} className="h-full w-full" />
          ) : !src ? (
            <div className="flex h-full items-center justify-center text-sm text-foreground/40">
              圖片處理中
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

        {isVideo && (
          <p
            className={`text-xs ${
              item.transcodeStatus === "failed" ? "text-destructive" : "text-foreground/50"
            }`}
            data-testid="media-detail-transcode"
          >
            {transcodeNote(item.transcodeStatus)}
          </p>
        )}

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

        <label className="flex items-start gap-2">
          <input
            data-testid="media-detail-usage"
            type="checkbox"
            checked={showOnWall}
            onChange={(e) => setShowOnWall(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            顯示在相片牆
            <span className="block text-xs text-muted-foreground">
              {wasAttachment
                ? "這個檔案目前是文章裡的圖片，不會出現在相片牆。勾選後會一併公開在相片牆。"
                : "取消勾選後只有你自己看得到，檔案仍然保留。"}
            </span>
          </span>
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
            {isVideo && item.transcodeStatus === "failed" && (
              <Button
                data-testid="media-detail-retry-transcode"
                variant="outline"
                className="justify-center"
                disabled={status === "retrying"}
                onClick={retry}
              >
                {status === "retrying" ? "重新排隊中…" : "重新轉檔"}
              </Button>
            )}
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
