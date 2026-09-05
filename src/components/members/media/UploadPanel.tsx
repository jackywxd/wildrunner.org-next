"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import Link from "@/components/i18n/locale-link";
import { Check, ImageUp, Play, X } from "lucide-react";

import { requestTranscode } from "@/lib/members/transcode-video";
import { findDuplicateUpload } from "@/lib/members/duplicate-upload";
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
import { downscaleImage } from "@/lib/media/downscale";
import { MAX_UPLOAD_LABEL } from "@/lib/media/upload-limits";
import {
  isFinished,
  mergeFiles,
  summarise,
  type QueueItem,
} from "@/lib/members/upload-queue";
import { Button } from "@/components/ui/button";
import {
  RaceClaimFields,
  emptyRaceClaim,
  raceClaimNamesEvent,
  type RaceClaim,
} from "@/components/members/races/RaceClaimFields";
import type { CatalogueEvent } from "@/lib/races/catalogue-shape";
import { resolveRaceEdition } from "@/lib/members/race-editions";

async function parseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { errors?: { message?: string }[] };
    return body.errors?.[0]?.message || fallback;
  } catch {
    return fallback;
  }
}

/**
 * The member's upload screen, on its own route.
 *
 * EVERY BYTE-MOVING CALL IS UNCHANGED from the control this replaces —
 * `direct-upload.ts`, `upload-store.ts`, the duplicate check, the downscale,
 * the sequential queue and its reason. This was an interface rewrite, and the
 * one thing it must not have done is quietly become an upload rewrite too.
 *
 * WHY IT IS A PAGE. It used to sit above the library grid, and the two were
 * competing: one screen for "manage what is already here" and "add more" at
 * once, with the uploader collapsed to a bare `<input type="file">` because
 * that was all the room it had. A control that supports multi-select, drag
 * and drop, race tagging, resume and de-duplication had not one word of copy
 * describing any of it.
 *
 * FOUR STATES, and the last one did not exist before:
 *
 *   A  nothing picked   the dropzone says what it accepts, and the batch
 *                       settings are visible *before* anything is chosen —
 *                       "you can link a race" is only useful while there is
 *                       still time to think about it
 *   B  picked           thumbnails, a per-file remove, and a slim dropzone
 *                       that says a second drop ADDS rather than replaces
 *   C  running          one total progress line and a per-tile state
 *   D  finished         stored / already-there / refused, counted separately,
 *                       and a reset that keeps the settings
 *
 * NO FULL-SCREEN SHIELD. The old control threw a fixed overlay across the
 * page while bytes moved, because the library underneath was about to change
 * and everything on it was reachable. On its own route there is nothing
 * behind to protect, and the one real risk — navigating away mid-upload — is
 * what `beforeunload` is for. A black sheet was standing in for a browser
 * feature.
 */
export function UploadPanel({
  catalogueEvents,
  preselectedRace,
}: {
  /** Server-computed options only — see the route for why this is a prop. */
  catalogueEvents: CatalogueEvent[];
  /** From a 上傳相片-style deep link — a hint, not a requirement. */
  preselectedRace?: RaceClaim | null;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  /**
   * The catalogue's question, not the calendar's — see `RaceClaimFields`.
   * `start()` turns the claim into the `race-editions` id the column stores.
   */
  const [raceClaim, setRaceClaim] = useState<RaceClaim>(
    () => preselectedRace ?? emptyRaceClaim(new Date()),
  );
  /** A batch-level failure, distinct from a per-file one: the race could not
   *  be resolved, so nothing was uploaded rather than uploaded untagged. */
  const [batchError, setBatchError] = useState("");
  // Applies to the whole batch, not per file. A member picking 40 photos they
  // do not want public would otherwise have to open 40 detail dialogs after
  // the fact.
  const [showOnWall, setShowOnWall] = useState(true);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopRef = useRef(false);

  const summary = summarise(items);
  const finished = !running && isFinished(summary);

  /**
   * Thumbnails, drawn from the bytes already in the browser.
   *
   * `createObjectURL` rather than anything server-side: the whole point is to
   * see what was picked *before* it is uploaded, which is the only moment a
   * wrong pick is cheap to fix. Kept in a ref keyed by the same identity the
   * queue de-duplicates on, and revoked when the file leaves the list —
   * forty un-revoked object URLs is forty photographs held in memory.
   */
  const previews = useRef(new Map<string, string>());
  const previewFor = useCallback((file: File): string | null => {
    if (!file.type.startsWith("image/")) return null;
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    const existing = previews.current.get(key);
    if (existing) return existing;
    const url = URL.createObjectURL(file);
    previews.current.set(key, url);
    return url;
  }, []);
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  /**
   * The browser's own "are you sure" while bytes are moving.
   *
   * Registered only while running, so an idle page never argues with somebody
   * leaving it.
   */
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  function choose(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Append, never replace — see `mergeFiles` for the bug this fixes.
    setItems((prev) => mergeFiles(prev, Array.from(files)));
    setBatchError("");
    // The picker keeps showing the last filename otherwise, which reads as
    // "this is still queued" beside a list that already holds it.
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeAt(index: number) {
    setItems((prev) => {
      const item = prev[index];
      if (item) {
        const key = `${item.file.name}|${item.file.size}|${item.file.lastModified}`;
        const url = previews.current.get(key);
        if (url) {
          URL.revokeObjectURL(url);
          previews.current.delete(key);
        }
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function patchItem(index: number, patch: Partial<QueueItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function uploadOne(index: number, picked: File, raceEditionId: number | null) {
    patchItem(index, { status: "checking", percent: 0, message: "" });

    // Shrink first, so everything downstream describes the file that will
    // actually be stored: the fingerprint below is of the stored bytes, and
    // the quota `enforceStorageQuota` bills is the stored size. Fingerprinting
    // the original would also make the same photo look new after a change to
    // MAX_EDGE. A file that needs no resizing comes back unchanged.
    const chosen = await downscaleImage(picked);

    // Before any bytes move. A member who picked the same 400 MB clip twice
    // should learn that now, not after waiting for the second copy to
    // upload. A file the check cannot fingerprint (no crypto.subtle) or
    // cannot look up (offline) comes back as "no duplicate" and uploads
    // normally — losing the check is a far smaller failure than refusing to
    // add media at all.
    const duplicate = await findDuplicateUpload(chosen);
    if (duplicate.existing) {
      patchItem(index, {
        status: "duplicate",
        message: `已經上傳過了：${duplicate.existing.alt}`,
      });
      return;
    }

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
          // Stated rather than left to the field default, so this control is
          // the single answer for both branches below.
          usage: showOnWall ? "gallery" : "private",
          ...(duplicate.fingerprint ? { contentFingerprint: duplicate.fingerprint } : {}),
          ...(raceEditionId !== null ? { raceEdition: raceEditionId } : {}),
        });
        mediaId = created.id;
      } else {
        const body = new FormData();
        body.set("file", chosen);
        body.set(
          "_payload",
          JSON.stringify({
            alt: defaultAltFor(chosen.name),
            usage: showOnWall ? "gallery" : "private",
            ...(duplicate.fingerprint ? { contentFingerprint: duplicate.fingerprint } : {}),
            ...(raceEditionId !== null ? { raceEdition: raceEditionId } : {}),
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
      // for why this can't be a beforeChange/afterChange hook on the create
      // itself. Never blocks the upload from being marked done.
      await fetch(`/api/members/media/${mediaId}/process-image`, {
        method: "POST",
        credentials: "same-origin",
      }).catch(() => {});

      // Videos additionally get queued for transcoding to H.264 1080p. Also
      // best-effort, and also deliberately not awaited to completion: the
      // endpoint returns as soon as the job is queued.
      if (chosen.type.startsWith("video/")) {
        await requestTranscode(mediaId);
      }

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

  async function start() {
    setRunning(true);
    stopRef.current = false;
    setBatchError("");

    // Resolved once for the whole batch, before any bytes move. Once because
    // the answer is one row and forty files asking for it would be forty
    // find-or-creates racing each other; before because a race the member
    // picked and the library could not resolve must not become forty untagged
    // uploads — that looks exactly like the tag having worked, right up until
    // they go looking for the album.
    let raceEditionId: number | null = null;
    if (raceClaimNamesEvent(raceClaim)) {
      const resolved = await resolveRaceEdition({
        eventId: raceClaim.eventId,
        year: raceClaim.year,
      });
      if (!resolved.ok) {
        setBatchError(resolved.message);
        setRunning(false);
        return;
      }
      raceEditionId = resolved.id;
    }

    // `items` here is this render's snapshot — correct both for a fresh queue
    // and for resuming one where earlier files are already `done` (skipped
    // below), since a new `start` closure is created on every render and the
    // button always invokes the latest one.
    for (let i = 0; i < items.length; i++) {
      if (stopRef.current) break;
      if (items[i].status === "done" || items[i].status === "duplicate") continue;
      await uploadOne(i, items[i].file, raceEditionId);
    }
    setRunning(false);
  }

  function cancel() {
    stopRef.current = true;
    abortRef.current?.abort();
  }

  /**
   * Clear the list, keep the settings.
   *
   * Both halves are deliberate. Clearing is what the old control never did —
   * it ended on a list of rows reading 完成 with no way back to an empty
   * screen. Keeping 相片牆 and the race is because the common next act is
   * another batch from the same race, and making somebody re-answer two
   * questions they just answered is the friction this redesign exists to
   * remove.
   */
  function again() {
    for (const url of previews.current.values()) URL.revokeObjectURL(url);
    previews.current.clear();
    setItems([]);
    setBatchError("");
  }

  // Typed for the element they are actually attached to. Both dropzones are
  // `<label for>` rather than `<div>`, so the whole target opens the file
  // picker on click as well as accepting a drop — one affordance, both ways in.
  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    if (running) return;
    choose(event.dataTransfer.files);
  }

  const dropHandlers = {
    onDragOver: (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      if (!running) setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop,
  };

  const overall =
    summary.total === 0
      ? 0
      : Math.round(((summary.done + summary.duplicate + summary.error) / summary.total) * 100);

  return (
    <div className="space-y-5" data-testid="media-upload-panel">
      {/* Hidden, and driven by the labels below: a bare file input renders as
          the browser's own "Choose Files", which is the control this redesign
          is replacing. Kept in the DOM (not conditionally rendered) so both
          dropzone states can point at it and so a test can set files on it. */}
      <input
        ref={inputRef}
        data-testid="media-upload-input"
        id="media-upload-input"
        type="file"
        accept="image/*,video/*"
        multiple
        disabled={running}
        onChange={(event) => choose(event.target.files)}
        className="sr-only"
      />

      {items.length === 0 ? (
        <label
          htmlFor="media-upload-input"
          data-testid="media-upload-dropzone"
          {...dropHandlers}
          className={`flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed p-10 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border bg-secondary"
          }`}
        >
          <ImageUp className="size-8 text-muted-foreground" aria-hidden="true" />
          <span className="text-base font-medium">把照片或影片拖進來</span>
          <span className="text-sm text-muted-foreground">
            可以一次拖很多個，或<span className="ml-1 text-primary underline">選擇檔案</span>
          </span>
          <span className="mt-1 text-xs text-muted-foreground">
            圖片和影片　單檔最大 {MAX_UPLOAD_LABEL}
          </span>
        </label>
      ) : (
        <label
          htmlFor="media-upload-input"
          data-testid="media-upload-dropzone"
          {...dropHandlers}
          className={`block cursor-pointer border-2 border-dashed p-4 text-center text-sm transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border bg-secondary"
          } ${running ? "pointer-events-none opacity-50" : ""}`}
        >
          再拖更多進來，或<span className="mx-1 text-primary underline">繼續選擇檔案</span>
          <span className="text-muted-foreground">（會加進下面的清單，不會取代）</span>
        </label>
      )}

      {items.length > 0 && (
        <>
          <div
            className="flex flex-wrap items-baseline justify-between gap-3 text-sm"
            data-testid="media-upload-summary"
          >
            <span>
              {summary.total} 個檔案 · 共 {formatBytes(summary.bytes)}
            </span>
            {running && (
              <span className="tabular-nums text-muted-foreground">
                已完成 {summary.done + summary.duplicate + summary.error} / {summary.total}
              </span>
            )}
          </div>

          {running && (
            <div className="h-1.5 w-full overflow-hidden bg-secondary" data-testid="media-upload-overall">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${overall}%` }}
              />
            </div>
          )}

          <ul
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
            data-testid="media-upload-queue"
          >
            {items.map((item, index) => {
              const preview = previewFor(item.file);
              return (
                <li
                  key={`${item.file.name}-${item.file.size}-${item.file.lastModified}`}
                  data-status={item.status}
                  data-testid="media-upload-queue-item"
                  className="relative border border-border bg-secondary"
                >
                  <div className="flex aspect-square items-center justify-center overflow-hidden">
                    {preview ? (
                      // Not next/image: the source is an object URL for bytes
                      // that exist only in this tab, and the loader would try
                      // to route it through the image CDN.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={preview}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Play className="size-7 text-muted-foreground" aria-hidden="true" />
                    )}
                  </div>

                  {!running && item.status !== "done" && (
                    <button
                      type="button"
                      onClick={() => removeAt(index)}
                      data-testid="media-upload-remove"
                      aria-label={`移除 ${item.file.name}`}
                      className="absolute right-1 top-1 flex size-6 items-center justify-center bg-black/70 text-white"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}

                  {(item.status === "uploading" || item.status === "saving") && (
                    <div
                      className="h-1 w-full bg-border"
                      data-percent={item.percent}
                      data-testid="media-upload-progress"
                    >
                      <div
                        className={`h-full bg-primary transition-[width] duration-300 ${
                          item.status === "saving" ? "animate-pulse" : ""
                        }`}
                        style={{ width: `${item.status === "saving" ? 100 : item.percent}%` }}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1 text-[11px] text-muted-foreground">
                    <span className="min-w-0 truncate">{item.file.name}</span>
                    <span className="shrink-0 tabular-nums">{formatBytes(item.file.size)}</span>
                  </div>

                  {item.status === "done" && (
                    <span
                      data-testid="media-upload-done"
                      className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-emerald-600/90 px-2 py-0.5 text-[11px] text-white"
                    >
                      <Check className="size-3" /> 完成
                    </span>
                  )}
                  {item.status === "duplicate" && (
                    <span
                      data-testid="media-upload-duplicate"
                      title={item.message}
                      className="absolute inset-x-0 bottom-0 bg-amber-500/90 px-2 py-0.5 text-[11px] text-white"
                    >
                      已上傳過
                    </span>
                  )}
                  {item.status === "error" && (
                    <span
                      data-testid="media-upload-error"
                      title={item.message}
                      className="absolute inset-x-0 bottom-0 truncate bg-destructive/90 px-2 py-0.5 text-[11px] text-white"
                    >
                      {item.message}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/*
        Above the queue in reading order for state A and below it once files
        are picked — but rendered once, here, because two copies of the same
        two controls is two places for them to disagree. In state A the
        dropzone is the only thing above it, which is the point: "you can link
        a race" arrives while there is still time to act on it.
      */}
      <div className="border border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm font-medium">
          <span>這一批的設定</span>
          <span className="text-xs font-normal text-muted-foreground">
            上傳後每一張都還能單獨改
          </span>
        </div>
        <div className="space-y-4 p-3">
          <label className="flex items-start gap-2">
            <input
              data-testid="media-upload-usage"
              type="checkbox"
              checked={showOnWall}
              disabled={running}
              onChange={(event) => setShowOnWall(event.target.checked)}
              className="mt-1"
            />
            <span className="text-sm">
              顯示在相片牆
              <span className="block text-xs text-muted-foreground">
                取消勾選就只留在你的媒體庫，不會出現在公開頁面。
              </span>
            </span>
          </label>

          {catalogueEvents.length > 0 && (
            <div className="space-y-2" data-testid="media-upload-race">
              <span className="block text-sm">
                這些照片是哪一場比賽的<span className="text-muted-foreground">（選填）</span>
                <span className="block text-xs text-muted-foreground">
                  選了之後，這場比賽的相片集會自動出現，不用另外建相簿。
                </span>
              </span>
              <RaceClaimFields
                busy={running}
                catalogueEvents={catalogueEvents}
                onChange={setRaceClaim}
                value={raceClaim}
                withDistance={false}
              />
              {raceClaimNamesEvent(raceClaim) && (
                <button
                  type="button"
                  data-testid="media-upload-race-clear"
                  disabled={running}
                  onClick={() => setRaceClaim(emptyRaceClaim(new Date()))}
                  className="text-xs text-muted-foreground underline"
                >
                  不連結比賽
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {batchError && (
        <p className="text-sm text-destructive" data-testid="media-upload-batch-error">
          {batchError}
        </p>
      )}

      {finished ? (
        <div className="space-y-3 border border-emerald-600 bg-emerald-50 p-4 dark:bg-emerald-950/30" data-testid="media-upload-result">
          <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
            <Check className="size-5" />
            {summary.done} 個檔案已上傳
          </p>
          <div className="space-y-0.5 text-sm text-muted-foreground">
            {summary.done > 0 && (
              <p>
                {showOnWall ? "已顯示在相片牆。" : "只留在你的媒體庫，沒有公開。"}
                {raceClaimNamesEvent(raceClaim) && "已加到這場比賽的相片集。"}
              </p>
            )}
            {summary.duplicate > 0 && (
              <p className="text-amber-600">
                {summary.duplicate} 個跳過：你已經上傳過了。
              </p>
            )}
            {summary.error > 0 && (
              <p className="text-destructive">
                {summary.error} 個失敗，原因寫在那一張的下方。
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={again} data-testid="media-upload-again" className="justify-center">
              再上傳一批
            </Button>
            <Link
              href="/members/media"
              data-testid="media-upload-to-library"
              className="inline-flex items-center justify-center border border-border px-4 py-2 text-sm"
            >
              回媒體庫
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            data-testid="media-upload-start"
            disabled={items.length === 0 || running || summary.pending === 0}
            onClick={start}
            className="justify-center"
          >
            {running
              ? "上傳中…"
              : summary.pending > 0 && summary.done + summary.error + summary.duplicate > 0
                ? `繼續上傳 ${summary.pending} 個`
                : `上傳 ${summary.total || ""} 個檔案`.trim()}
          </Button>
          {running ? (
            <Button
              type="button"
              variant="outline"
              data-testid="media-upload-cancel"
              className="justify-center"
              onClick={cancel}
            >
              取消剩下的
            </Button>
          ) : items.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              data-testid="media-upload-clear"
              className="justify-center"
              onClick={again}
            >
              全部清除
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">先選檔案</span>
          )}
          {running && (
            <span className="text-xs text-muted-foreground">
              已經上傳完的會留著。請不要關閉這一頁。
            </span>
          )}
        </div>
      )}
    </div>
  );
}
