"use client";

import { useRef, useState, type DragEvent } from "react";
import {
  DIRECT_UPLOAD_THRESHOLD,
  completeSession,
  createMediaDocument,
  defaultAltFor,
  formatBytes,
  reserveFilename,
  startSession,
  uploadParts,
} from "@/lib/direct-upload";
import { clearSession, loadSession, saveSession } from "@/lib/upload-store";
import { Button } from "@/components/ui/button";
import type { SiteRaceEditionOption } from "@/lib/content-types";

type ItemStatus = "queued" | "uploading" | "saving" | "done" | "error";

type QueueItem = {
  file: File;
  status: ItemStatus;
  percent: number;
  message: string;
};

async function parseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { errors?: { message?: string }[] };
    return body.errors?.[0]?.message || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Member-facing upload control. Every byte-moving call comes from
 * src/lib/direct-upload.ts and src/lib/upload-store.ts unmodified — this
 * component only owns UI state (which files are queued, each one's phase and
 * progress). Files at or under DIRECT_UPLOAD_THRESHOLD keep Payload's own
 * upload path (multipart FormData to /api/media); larger ones go straight to
 * R2 and the document is created from metadata alone, exactly as
 * LargeUploadPanel does for admins.
 *
 * The queue runs sequentially, not in parallel: enforceStorageQuota
 * (quota.ts) recomputes usage from D1 fresh on every create, with no locking
 * across requests — N concurrent creates could each read the same total
 * before any of their writes commit. Awaiting each file before starting the
 * next keeps that check correct.
 */
export function UploadDropzone({
  onUploaded,
  preselectedRaceEditionId,
  raceEditions,
}: {
  onUploaded: () => void;
  /** From a 上傳相片-style deep link — a hint, not a requirement. */
  preselectedRaceEditionId?: number;
  /** Server-computed options only — see MediaLibrary.tsx on why this is a prop, not a client fetch. */
  raceEditions: SiteRaceEditionOption[];
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [raceEditionId, setRaceEditionId] = useState(
    preselectedRaceEditionId ? String(preselectedRaceEditionId) : "",
  );
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopRef = useRef(false);

  function choose(files: FileList | null) {
    if (!files || files.length === 0) return;
    setItems(
      Array.from(files).map((file) => ({
        file,
        status: "queued" as const,
        percent: 0,
        message: "",
      })),
    );
  }

  function patchItem(index: number, patch: Partial<QueueItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function uploadOne(index: number, chosen: File) {
    patchItem(index, { status: "uploading", percent: 0, message: "" });

    try {
      let mediaId: number;

      if (chosen.size > DIRECT_UPLOAD_THRESHOLD) {
        const resume = await loadSession(chosen);
        const controller = new AbortController();
        abortRef.current = controller;
        const session = resume ?? (await startSession(chosen, await reserveFilename(chosen)));

        await uploadParts(session, chosen, {
          signal: controller.signal,
          onPart: (current) => saveSession(chosen, current),
          onProgress: ({ partsDone, partTotal }) => {
            patchItem(index, {
              percent: partTotal === 0 ? 100 : Math.round((partsDone / partTotal) * 100),
            });
          },
        });
        await completeSession(session);
        await clearSession(chosen);

        patchItem(index, { status: "saving" });
        const created = await createMediaDocument({
          filename: session.filename,
          mimeType: session.mimeType,
          alt: defaultAltFor(chosen.name),
          ...(raceEditionId ? { raceEdition: Number(raceEditionId) } : {}),
        });
        mediaId = created.id;
      } else {
        const body = new FormData();
        body.set("file", chosen);
        body.set(
          "_payload",
          JSON.stringify({
            alt: defaultAltFor(chosen.name),
            ...(raceEditionId ? { raceEdition: Number(raceEditionId) } : {}),
          }),
        );
        const response = await fetch("/api/media", {
          method: "POST",
          credentials: "same-origin",
          body,
        });
        if (!response.ok) throw new Error(await parseError(response, "上傳失敗"));
        const created = (await response.json()) as { doc: { id: number } };
        mediaId = created.doc.id;
      }

      // Best-effort: blurDataURL, real dimensions, HEIC→WebP conversion.
      // A separate request on purpose — see processMediaImage.ts's header
      // for why this can't be a beforeChange/afterChange hook on the
      // create itself. Never blocks the upload from being marked done: it
      // already succeeded by this point.
      await fetch(`/api/members/media/${mediaId}/process-image`, {
        method: "POST",
        credentials: "same-origin",
      }).catch(() => {});

      patchItem(index, { status: "done", percent: 100 });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        patchItem(index, { status: "queued", message: "已取消" });
      } else {
        patchItem(index, { status: "error", message: (error as Error)?.message || "上傳失敗" });
      }
    } finally {
      abortRef.current = null;
    }
  }

  async function run() {
    setRunning(true);
    stopRef.current = false;
    // `items` here is this render's snapshot — correct both for a fresh
    // queue and for resuming one where earlier files are already "done"
    // (skipped below), since a new `run` closure is created on every render
    // and the button always invokes the latest one.
    for (let i = 0; i < items.length; i++) {
      if (stopRef.current) break;
      if (items[i].status === "done") continue;
      await uploadOne(i, items[i].file);
    }
    setRunning(false);
    onUploaded();
  }

  function cancel() {
    stopRef.current = true;
    abortRef.current?.abort();
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (running) return;
    choose(event.dataTransfer.files);
  }

  const done = items.filter((item) => item.status === "done").length;

  return (
    <div
      data-testid="media-upload-dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        if (!running) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`space-y-3 border border-dashed p-4 transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <input
        ref={inputRef}
        data-testid="media-upload-input"
        type="file"
        accept="image/*,video/*"
        multiple
        disabled={running}
        onChange={(event) => choose(event.target.files)}
        className="text-sm"
      />

      {items.length > 0 && (
        <>
          {raceEditions.length > 0 && (
            <label className="block space-y-1">
              <span className="text-sm">這些照片是哪一場比賽的（選填）</span>
              <select
                data-testid="media-upload-race-edition"
                value={raceEditionId}
                disabled={running}
                onChange={(event) => setRaceEditionId(event.target.value)}
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

          <ul className="space-y-1" data-testid="media-upload-queue">
            {items.map((item, index) => (
              <li
                key={`${item.file.name}-${item.file.size}-${item.file.lastModified}-${index}`}
                className="flex items-center justify-between gap-3 text-xs"
                data-status={item.status}
                data-testid="media-upload-queue-item"
              >
                <span className="min-w-0 flex-1 truncate text-foreground/80">
                  {item.file.name} · {formatBytes(item.file.size)}
                </span>
                {item.status === "uploading" || item.status === "saving" ? (
                  <span
                    className="shrink-0 text-foreground/60"
                    data-percent={item.percent}
                    data-testid="media-upload-progress"
                  >
                    {item.status === "saving" ? "建立文件…" : `${item.percent}%`}
                  </span>
                ) : item.status === "done" ? (
                  <span className="shrink-0 text-foreground/60" data-testid="media-upload-done">
                    完成
                  </span>
                ) : item.status === "error" ? (
                  <span className="shrink-0 text-destructive" data-testid="media-upload-error">
                    {item.message}
                  </span>
                ) : (
                  <span className="shrink-0 text-foreground/40">等待中</span>
                )}
              </li>
            ))}
          </ul>

          {items.length > 1 && (
            <p className="text-xs text-foreground/60" data-testid="media-upload-summary">
              {done} / {items.length} 完成
            </p>
          )}
        </>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          data-testid="media-upload-start"
          disabled={items.length === 0 || running}
          onClick={run}
          className="justify-center"
        >
          {done > 0 && done < items.length ? "繼續上傳" : "上傳"}
        </Button>
        {running && (
          <Button type="button" variant="outline" className="justify-center" onClick={cancel}>
            取消
          </Button>
        )}
      </div>
    </div>
  );
}
