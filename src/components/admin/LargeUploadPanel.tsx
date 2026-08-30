'use client'

import { useEffect, useRef, useState } from 'react'

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
} from '@/lib/direct-upload'
import { clearSession, loadSession, saveSession } from '@/lib/upload-store'

import { useDict } from './i18n'

import type { UploadSession } from '@/lib/direct-upload'

type Phase = 'idle' | 'uploading' | 'saving' | 'done' | 'error'

const dict = {
  en: {
    heading: 'Upload media',
    name: 'Name',
    partsSuffix: (n: number) => ` · ${n} parts straight to R2`,
    creatingDoc: 'Creating document…',
    resumable: (done: number, total: number) =>
      `An upload of this file is unfinished (${done} / ${total} parts sent) — it can be resumed.`,
    resume: 'Resume upload',
    start: 'Upload',
    cancel: 'Cancel',
    uploadAnother: 'Upload another',
    done: 'Done',
    open: 'Open',
    paused: 'Paused — upload can be resumed',
    uploadFailed: 'Upload failed',
  },
  'zh-TW': {
    heading: '上傳媒體',
    name: '名稱',
    partsSuffix: (n: number) => ` · 分 ${n} 段直接傳送到 R2`,
    creatingDoc: '建立文件…',
    resumable: (done: number, total: number) =>
      `這個檔案有未完成的上傳（已傳 ${done} / ${total} 段），可以接著傳。`,
    resume: '繼續上傳',
    start: '上傳',
    cancel: '取消',
    uploadAnother: '再傳一個',
    done: '完成',
    open: '開啟',
    paused: '已暫停，可繼續上傳',
    uploadFailed: '上傳失敗',
  },
}

/**
 * Upload panel for files Payload's own uploader cannot take.
 *
 * Rendered above the Media list rather than replacing the Upload field:
 * that keeps it clear of Payload's admin internals, which the field would
 * have to reach into, and matches how StorageQuotaField is wired.
 *
 * Both sizes go through here so members have one place to upload. Under
 * DIRECT_UPLOAD_THRESHOLD it posts the file normally, so Payload still
 * fills in image dimensions; above it the bytes go straight to R2 and only
 * metadata reaches the server.
 */
export function LargeUploadPanel() {
  const t = useDict(dict)
  const [file, setFile] = useState<File | null>(null)
  const [alt, setAlt] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [percent, setPercent] = useState(0)
  const [sent, setSent] = useState(0)
  const [message, setMessage] = useState('')
  const [docId, setDocId] = useState<number | null>(null)
  const [resumable, setResumable] = useState<UploadSession | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const reset = () => {
    setFile(null)
    setAlt('')
    setPercent(0)
    setSent(0)
    setMessage('')
    setDocId(null)
    setPhase('idle')
    setResumable(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const choose = (chosen: File | null) => {
    setFile(chosen)
    setAlt(chosen ? defaultAltFor(chosen.name) : '')
    setPercent(0)
    setSent(0)
    setMessage('')
    setDocId(null)
    setPhase('idle')
    setResumable(null)
  }

  // An unfinished upload of this exact file can be picked up rather than
  // restarted. Matching is on name + size + mtime, so a different file with
  // the same name never resumes into the wrong object.
  useEffect(() => {
    let current = true
    if (!file || file.size <= DIRECT_UPLOAD_THRESHOLD) {
      setResumable(null)
      return
    }
    loadSession(file).then((session) => {
      if (current) setResumable(session)
    })
    return () => {
      current = false
    }
  }, [file])

  // Both branches state `usage: 'gallery'` rather than leaning on the field
  // default, which is 'attachment'. This panel is the admin's own media
  // library, so what it uploads is photo-wall content — and saying so is what
  // lets the default stay fail-closed for the one caller that says nothing,
  // /admin's rich-text upload drawer. See media.usage's header.
  async function uploadSmall(chosen: File) {
    const body = new FormData()
    body.set('file', chosen)
    body.set('_payload', JSON.stringify({ alt: alt || defaultAltFor(chosen.name), usage: 'gallery' }))

    const response = await fetch('/api/media', {
      method: 'POST',
      credentials: 'same-origin',
      body,
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text.slice(0, 300))
    }
    return ((await response.json()) as { doc: { id: number } }).doc
  }

  async function uploadLarge(chosen: File, resume: UploadSession | null) {
    const controller = new AbortController()
    abortRef.current = controller

    // Resuming reuses the reserved filename and upload id; only the parts
    // missing from the stored session are sent again.
    const session =
      resume ?? (await startSession(chosen, await reserveFilename(chosen)))

    await uploadParts(session, chosen, {
      signal: controller.signal,
      onPart: (current) => saveSession(chosen, current),
      onProgress: ({ uploadedBytes, partsDone, partTotal }) => {
        setSent(uploadedBytes)
        setPercent(partTotal === 0 ? 100 : Math.round((partsDone / partTotal) * 100))
      },
    })
    await completeSession(session)
    await clearSession(chosen)

    setPhase('saving')
    return createMediaDocument({
      filename: session.filename,
      mimeType: session.mimeType,
      alt: alt || defaultAltFor(chosen.name),
      usage: 'gallery',
    })
  }

  async function upload(resume: UploadSession | null = null) {
    if (!file) return
    setPhase('uploading')
    setMessage('')
    try {
      const doc =
        file.size > DIRECT_UPLOAD_THRESHOLD
          ? await uploadLarge(file, resume)
          : await uploadSmall(file)
      // Best-effort: blurDataURL, real dimensions, HEIC→WebP conversion —
      // see processMediaImage.ts for why this is a separate request.
      await fetch(`/api/members/media/${doc.id}/process-image`, {
        method: 'POST',
        credentials: 'same-origin',
      }).catch(() => {})
      setDocId(doc.id)
      setPercent(100)
      setPhase('done')
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        // The parts already sent stay recorded, so this is a pause.
        setMessage(t.paused)
        setPhase('idle')
        if (file) setResumable(await loadSession(file))
        return
      }
      setMessage((error as Error)?.message || t.uploadFailed)
      setPhase('error')
    } finally {
      abortRef.current = null
    }
  }

  const busy = phase === 'uploading' || phase === 'saving'
  const direct = file ? file.size > DIRECT_UPLOAD_THRESHOLD : false

  return (
    <section
      data-testid="large-upload"
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '4px',
        padding: 'var(--base)',
        marginBottom: 'var(--base)',
        display: 'grid',
        gap: 'calc(var(--base) / 2)',
      }}
    >
      <strong>{t.heading}</strong>

      <input
        ref={inputRef}
        data-testid="large-upload-input"
        type="file"
        accept="image/*,video/*"
        disabled={busy}
        onChange={(event) => choose(event.target.files?.[0] ?? null)}
      />

      {file && (
        <>
          <div style={{ fontSize: '0.85rem', color: 'var(--theme-elevation-600)' }}>
            {file.name} · {formatBytes(file.size)}
            {direct &&
              t.partsSuffix(
                partCount({
                  key: '',
                  uploadId: '',
                  filename: file.name,
                  mimeType: file.type,
                  size: file.size,
                  chunkSize: CHUNK_SIZE,
                  parts: [],
                }),
              )}
          </div>

          <label style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontSize: '0.85rem' }}>{t.name}</span>
            <input
              data-testid="large-upload-alt"
              type="text"
              value={alt}
              disabled={busy}
              onChange={(event) => setAlt(event.target.value)}
            />
          </label>
        </>
      )}

      {busy && (
        <div data-testid="large-upload-progress" data-percent={percent}>
          <div
            style={{
              height: '6px',
              background: 'var(--theme-elevation-100)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${percent}%`,
                background: 'var(--theme-success-500)',
                transition: 'width 120ms linear',
              }}
            />
          </div>
          <small>
            {phase === 'saving'
              ? t.creatingDoc
              : `${percent}% · ${formatBytes(sent)} / ${file ? formatBytes(file.size) : ''}`}
          </small>
        </div>
      )}

      {resumable && !busy && (
        <div data-testid="large-upload-resumable" style={{ fontSize: '0.85rem' }}>
          {t.resumable(resumable.parts.length, partCount(resumable))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          data-testid="large-upload-start"
          disabled={!file || busy}
          onClick={() => upload(resumable)}
        >
          {resumable ? t.resume : t.start}
        </button>
        {busy && direct && (
          <button type="button" data-testid="large-upload-cancel" onClick={() => abortRef.current?.abort()}>
            {t.cancel}
          </button>
        )}
        {(phase === 'done' || phase === 'error') && (
          <button type="button" onClick={reset}>
            {t.uploadAnother}
          </button>
        )}
      </div>

      {phase === 'done' && docId !== null && (
        <div data-testid="large-upload-done" data-doc-id={docId} style={{ color: 'var(--theme-success-500)' }}>
          {t.done} · <a href={`/admin/collections/media/${docId}`}>{t.open}</a>
        </div>
      )}

      {phase === 'error' && (
        <div data-testid="large-upload-error" style={{ color: 'var(--theme-error-500)' }}>
          {message}
        </div>
      )}
    </section>
  )
}
