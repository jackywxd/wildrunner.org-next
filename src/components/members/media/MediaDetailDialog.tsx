"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { formatBytes } from "@/lib/direct-upload";
import { mediaImageSrc } from "@/lib/cf-image";
import { Button } from "@/components/ui/button";
import { StreamVideoPlayer } from "@/components/stream-video-player";
import type { Media } from "@/payload-types";
import { transcodeNote } from "@/lib/media/transcode-copy";
import { mediaToSiteVideo } from "@/lib/media/site-video";
import { nextUsage } from "@/lib/media/usage";
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
  const [title, setTitle] = useState(item.title ?? "");
  // `depth=0` on the list this dialog is opened from (MediaLibrary.tsx), so
  // `raceEdition` is always a bare id or null here — never a populated doc.
  const [raceEditionId, setRaceEditionId] = useState(
    typeof item.raceEdition === "number" ? String(item.raceEdition) : "",
  );
  // Only `gallery` and `private` are this checkbox's to write; `attachment`
  // is provenance the editor's upload path set. `nextUsage` is what keeps the
  // difference — see src/lib/media/usage.ts for the alt-text edit that used to
  // reclassify an article image on the way past.
  const [showOnWall, setShowOnWall] = useState(item.usage === "gallery");
  const wasAttachment = item.usage === "attachment";
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "saving" | "deleting" | "retrying" | "posterizing" | "error"
  >("idle");
  // What the member is looking at. `currentTime` is the only place the frame
  // they mean exists, and it lives on the element rather than in React state
  // — reading it on click is exact, while mirroring every `timeupdate` into
  // state would re-render the dialog four times a second to learn the same
  // thing.
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const [posterNote, setPosterNote] = useState("");
  const [error, setError] = useState("");

  const isVideo = (item.mimeType ?? "").startsWith("video/");
  const src = mediaImageSrc(item);
  // The conversion used to be written out here, because content.ts resolves
  // the payload client at module scope and cannot be imported into a client
  // bundle. That is still true; @/lib/media/site-video is the same mapping
  // with no server dependencies, so there is one definition again.
  const video: SiteVideo | null = isVideo ? mediaToSiteVideo(item) : null;

  /**
   * Send the player's own position, and say what happened.
   *
   * The frame is taken by the container, not here: the video is served from
   * images.wildrunner.org while the app is on its own origin, so drawing it to
   * a canvas would taint the canvas and `toBlob` would throw. Nothing in this
   * repo configures CORS on that bucket, so a client-side capture would be a
   * bucket configuration change dressed up as a UI feature.
   *
   * Reports failure rather than swallowing it. This is a button a member
   * pressed and is watching, and the one thing this feature must not do is
   * what the poster backfill did — appear to work while nothing was listening.
   */
  async function useCurrentFrame() {
    const el = videoEl.current;
    if (!el) {
      // The Stream `<iframe>` branch, which exposes no playback position.
      setPosterNote("這個播放器無法取得目前時間。");
      return;
    }

    const seconds = el.currentTime;
    setStatus("posterizing");
    setPosterNote("");
    try {
      const res = await fetch(`/api/members/media/${item.id}/poster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds }),
      });
      if (!res.ok) {
        // 503 is the transcoder being unavailable — the normal case in dev
        // and CI, where the service binding does not exist — and it is worth
        // saying plainly rather than as a status code.
        setPosterNote(
          res.status === 503
            ? "轉檔服務目前無法使用,請稍後再試。"
            : `擷取失敗 (${res.status})`,
        );
        setStatus("idle");
        return;
      }
      setPosterNote(
        `已送出第 ${seconds.toFixed(1)} 秒的畫面,封面更新後會出現在相片牆。`,
      );
      setStatus("idle");
      // Deliberately NOT calling `onUpdated()`. This request changes no row —
      // the container patches `posterUrl` through its callback, seconds to
      // minutes later — so refreshing the library now would re-read exactly
      // what is already on screen. It also remounts this dialog, which threw
      // away the message above; the member pressed a button and got silence,
      // which is the one thing this feature must never do.
    } catch (err) {
      setPosterNote(err instanceof Error ? err.message : "擷取失敗");
      setStatus("idle");
    }
  }

  async function save() {
    setStatus("saving");
    setError("");
    const usageToWrite = nextUsage(item.usage, showOnWall);
    const res = await fetch(`/api/media/${item.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alt,
        // Empty string becomes null rather than being sent as "": the field
        // is nullable with no default specifically so "nobody has named
        // this" is representable, and mediaDisplayName only falls back to
        // its filename derivation on null/undefined, not on "".
        title: title.trim() || null,
        // Always sent, and `null` rather than omitted: picking "不連結比賽"
        // after a race was already set has to clear it, not leave it alone.
        raceEdition: raceEditionId ? Number(raceEditionId) : null,
        // Spread rather than always sent, unlike `raceEdition` above: this
        // control governs two of `usage`'s values and must not touch the
        // others, so `nextUsage` returns undefined for the cases it does not
        // own and the key is then absent from the body entirely.
        ...(usageToWrite !== undefined ? { usage: usageToWrite } : {}),
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
            <StreamVideoPlayer
              video={video}
              className="h-full w-full"
              videoRef={videoEl}
            />
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

        {isVideo && (
          <div className="space-y-1">
            <Button
              data-testid="media-detail-poster-frame"
              variant="outline"
              className="w-full justify-center"
              disabled={status === "posterizing"}
              onClick={useCurrentFrame}
            >
              {status === "posterizing" ? "擷取中…" : "用目前畫面當封面"}
            </Button>
            <span className="block text-xs text-muted-foreground">
              {posterNote ||
                "把影片播放或拖到想要的畫面,再按這裡。封面會顯示在相片牆和分享頁。"}
            </span>
          </div>
        )}

        <label className="block space-y-1">
          <span className="text-sm">顯示名稱</span>
          <input
            data-testid="media-detail-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={item.filename ?? ""}
            className="block w-full border border-input bg-background px-3 py-2 text-sm"
          />
          <span className="block text-xs text-muted-foreground">
            {isVideo
              ? "顯示在相片牆的影片卡片和分享頁標題。留空則使用檔名。"
              : "顯示在分享頁標題。留空則使用檔名。"}
          </span>
        </label>

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
                : "取消勾選後不會出現在公開相片牆，檔案仍然保留。"}
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
