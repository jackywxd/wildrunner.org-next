'use client'

import { useRef, useState } from 'react'

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

type Phase = 'idle' | 'uploading' | 'saving' | 'done' | 'error'

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
  const [file, setFile] = useState<File | null>(null)
  const [alt, setAlt] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [percent, setPercent] = useState(0)
  const [sent, setSent] = useState(0)
  const [message, setMessage] = useState('')
  const [docId, setDocId] = useState<number | null>(null)

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
  }

  async function uploadSmall(chosen: File) {
    const body = new FormData()
    body.set('file', chosen)
    body.set('_payload', JSON.stringify({ alt: alt || defaultAltFor(chosen.name) }))

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

  async function uploadLarge(chosen: File) {
    const controller = new AbortController()
    abortRef.current = controller

    const filename = await reserveFilename(chosen)
    const session = await startSession(chosen, filename)

    await uploadParts(session, chosen, {
      signal: controller.signal,
      onProgress: ({ uploadedBytes, totalBytes, partsDone, partTotal }) => {
        setSent(uploadedBytes)
        setPercent(partTotal === 0 ? 100 : Math.round((partsDone / partTotal) * 100))
      },
    })
    await completeSession(session)

    setPhase('saving')
    return createMediaDocument({
      filename: session.filename,
      mimeType: session.mimeType,
      alt: alt || defaultAltFor(chosen.name),
    })
  }

  async function upload() {
    if (!file) return
    setPhase('uploading')
    setMessage('')
    try {
      const doc =
        file.size > DIRECT_UPLOAD_THRESHOLD ? await uploadLarge(file) : await uploadSmall(file)
      setDocId(doc.id)
      setPercent(100)
      setPhase('done')
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        setMessage('已取消')
        setPhase('idle')
        return
      }
      setMessage((error as Error)?.message || '上傳失敗')
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
      <strong>上傳媒體</strong>

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
            {direct && ` · 分 ${partCount({
              key: '',
              uploadId: '',
              filename: file.name,
              mimeType: file.type,
              size: file.size,
              chunkSize: CHUNK_SIZE,
              parts: [],
            })} 段直接傳送到 R2`}
          </div>

          <label style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontSize: '0.85rem' }}>名稱</span>
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
              ? '建立文件…'
              : `${percent}% · ${formatBytes(sent)} / ${file ? formatBytes(file.size) : ''}`}
          </small>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" data-testid="large-upload-start" disabled={!file || busy} onClick={upload}>
          上傳
        </button>
        {busy && direct && (
          <button type="button" data-testid="large-upload-cancel" onClick={() => abortRef.current?.abort()}>
            取消
          </button>
        )}
        {(phase === 'done' || phase === 'error') && (
          <button type="button" onClick={reset}>
            再傳一個
          </button>
        )}
      </div>

      {phase === 'done' && docId !== null && (
        <div data-testid="large-upload-done" data-doc-id={docId} style={{ color: 'var(--theme-success-500)' }}>
          完成 · <a href={`/admin/collections/media/${docId}`}>開啟</a>
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
