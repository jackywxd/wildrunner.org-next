'use client'

import { useEffect, useState } from 'react'

import { useDict } from './i18n'

type Usage = { usedBytes: number; quotaBytes: number }

const toGb = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2)

const dict = {
  en: { used: 'Used', loadError: 'Could not load usage' },
  'zh-TW': { used: '已使用', loadError: '無法載入使用量' },
}

/**
 * Self-service usage readout, shown above the Media list.
 *
 * Deliberately not wired through Payload's field system — it has nothing
 * to save, it is a read of two other collections. `beforeListTable` on
 * Media just needs any React component.
 */
export function StorageQuotaField() {
  const t = useDict(dict)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/members/storage-usage', { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status}`)
        return response.json() as Promise<Usage>
      })
      .then(setUsage)
      .catch(() => setError(t.loadError))
  }, [t.loadError])

  if (error) return null
  if (!usage) return null

  const percent = usage.quotaBytes > 0 ? (usage.usedBytes / usage.quotaBytes) * 100 : 0

  return (
    <section
      data-testid="storage-usage"
      style={{
        border: '1px solid var(--theme-elevation-150)',
        padding: 'var(--base)',
        marginBottom: 'var(--base)',
      }}
    >
      <p style={{ margin: 0 }}>
        {t.used} <strong data-testid="storage-usage-value">{toGb(usage.usedBytes)}</strong> GB
        {' / '}
        {toGb(usage.quotaBytes)} GB
      </p>
      <div
        style={{
          marginTop: 8,
          height: 6,
          borderRadius: 3,
          background: 'var(--theme-elevation-150)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.min(percent, 100)}%`,
            height: '100%',
            background: percent >= 100 ? 'var(--theme-error-500)' : 'var(--theme-success-500)',
          }}
        />
      </div>
    </section>
  )
}
