"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  CHUNK_SIZE,
  DIRECT_UPLOAD_THRESHOLD,
  completeSession,
  createMediaDocument,
  defaultAltFor,
  formatBytes,
  partCount,
  reserveFilename,
  startSession,
  uploadParts,
  type UploadSession,
} from "@/lib/direct-upload";
import { clearSession, loadSession, saveSession } from "@/lib/upload-store";
import { Button } from "@/components/ui/button";
import type { SiteRaceEditionOption } from "@/lib/content-types";

type Phase = "idle" | "uploading" | "saving" | "done" | "error";

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
 * component only owns UI state (which file, what phase, the progress bar).
 * Files at or under DIRECT_UPLOAD_THRESHOLD keep Payload's own upload path
 * (multipart FormData to /api/media); larger ones go straight to R2 and the
 * document is created from metadata alone, exactly as LargeUploadPanel does
 * for admins.
 */
export function UploadDropzone({
  onUploaded,
  raceEditions,
}: {
  onUploaded: (id: number) => void;
  /** Server-computed options only — see MediaLibrary.tsx on why this is a prop, not a client fetch. */
  raceEditions: SiteRaceEditionOption[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [raceEditionId, setRaceEditionId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [sent, setSent] = useState(0);
  const [message, setMessage] = useState("");
  const [resumable, setResumable] = useState<UploadSession | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const choose = (chosen: File | null) => {
    setFile(chosen);
    setAlt(chosen ? defaultAltFor(chosen.name) : "");
    setRaceEditionId("");
    setPercent(0);
    setSent(0);
    setMessage("");
    setPhase("idle");
    setResumable(null);
  };

  useEffect(() => {
    let current = true;
    if (!file || file.size <= DIRECT_UPLOAD_THRESHOLD) {
      setResumable(null);
      return;
    }
    loadSession(file).then((session) => {
      if (current) setResumable(session);
    });
    return () => {
      current = false;
    };
  }, [file]);

  async function uploadSmall(chosen: File) {
    const body = new FormData();
    body.set("file", chosen);
    body.set(
      "_payload",
      JSON.stringify({
        alt: alt || defaultAltFor(chosen.name),
        ...(raceEditionId ? { raceEdition: Number(raceEditionId) } : {}),
      }),
    );

    const response = await fetch("/api/media", {
      method: "POST",
      credentials: "same-origin",
      body,
    });
    if (!response.ok) {
      throw new Error(await parseError(response, "上傳失敗"));
    }
    return ((await response.json()) as { doc: { id: number } }).doc;
  }

  async function uploadLarge(chosen: File, resume: UploadSession | null) {
    const controller = new AbortController();
    abortRef.current = controller;

    const session = resume ?? (await startSession(chosen, await reserveFilename(chosen)));

    await uploadParts(session, chosen, {
      signal: controller.signal,
      onPart: (current) => saveSession(chosen, current),
      onProgress: ({ uploadedBytes, partsDone, partTotal }) => {
        setSent(uploadedBytes);
        setPercent(partTotal === 0 ? 100 : Math.round((partsDone / partTotal) * 100));
      },
    });
    await completeSession(session);
    await clearSession(chosen);

    setPhase("saving");
    return createMediaDocument({
      filename: session.filename,
      mimeType: session.mimeType,
      alt: alt || defaultAltFor(chosen.name),
      ...(raceEditionId ? { raceEdition: Number(raceEditionId) } : {}),
    });
  }

  async function upload(resume: UploadSession | null = null) {
    if (!file) return;
    setPhase("uploading");
    setMessage("");
    try {
      const doc =
        file.size > DIRECT_UPLOAD_THRESHOLD
          ? await uploadLarge(file, resume)
          : await uploadSmall(file);
      setPercent(100);
      setPhase("done");
      onUploaded(doc.id);
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        setMessage("已暫停，可繼續上傳");
        setPhase("idle");
        if (file) setResumable(await loadSession(file));
        return;
      }
      setMessage((error as Error)?.message || "上傳失敗");
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  }

  const busy = phase === "uploading" || phase === "saving";
  const direct = file ? file.size > DIRECT_UPLOAD_THRESHOLD : false;

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (busy) return;
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) choose(dropped);
  }

  return (
    <div
      data-testid="media-upload-dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragOver(true);
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
        disabled={busy}
        onChange={(event) => choose(event.target.files?.[0] ?? null)}
        className="text-sm"
      />

      {file && (
        <>
          <div className="text-xs text-foreground/60">
            {file.name} · {formatBytes(file.size)}
            {direct &&
              ` · 分 ${partCount({
                key: "",
                uploadId: "",
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                chunkSize: CHUNK_SIZE,
                parts: [],
              })} 段直接傳送到 R2`}
          </div>
          <label className="block space-y-1">
            <span className="text-sm">替代文字</span>
            <input
              data-testid="media-upload-alt"
              type="text"
              value={alt}
              disabled={busy}
              onChange={(event) => setAlt(event.target.value)}
              className="block w-full border border-input bg-background px-3 py-2 text-sm"
            />
          </label>

          {raceEditions.length > 0 && (
            <label className="block space-y-1">
              <span className="text-sm">這張照片是哪一場比賽的（選填）</span>
              <select
                data-testid="media-upload-race-edition"
                value={raceEditionId}
                disabled={busy}
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
        </>
      )}

      {busy && (
        <div data-testid="media-upload-progress" data-percent={percent}>
          <div className="h-1.5 bg-secondary">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-foreground/60">
            {phase === "saving"
              ? "建立文件…"
              : `${percent}% · ${formatBytes(sent)} / ${file ? formatBytes(file.size) : ""}`}
          </p>
        </div>
      )}

      {resumable && !busy && (
        <p data-testid="media-upload-resumable" className="text-xs text-foreground/60">
          這個檔案有未完成的上傳（已傳 {resumable.parts.length} / {partCount(resumable)} 段），可以接著傳。
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          data-testid="media-upload-start"
          disabled={!file || busy}
          onClick={() => upload(resumable)}
          className="justify-center"
        >
          {resumable ? "繼續上傳" : "上傳"}
        </Button>
        {busy && direct && (
          <Button
            type="button"
            variant="outline"
            className="justify-center"
            onClick={() => abortRef.current?.abort()}
          >
            取消
          </Button>
        )}
        {phase === "done" && (
          <span data-testid="media-upload-done" className="text-xs text-foreground/60">
            上傳完成
          </span>
        )}
      </div>

      {phase === "error" && (
        <p data-testid="media-upload-error" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
