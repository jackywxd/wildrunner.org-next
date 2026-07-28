'use client'

import { Button } from '@payloadcms/ui'
import { useState } from 'react'

type InviteResult = {
  email?: string
  sent?: boolean
  emailError?: string
  inviteLink?: string
  expiresAt?: string
  errors?: { message: string }[]
}

export function InviteMemberPanel() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [result, setResult] = useState<InviteResult | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const invite = async () => {
    if (!email.trim()) {
      setError('請先輸入郵箱。')
      return
    }

    setError('')
    setResult(null)
    setCopied(false)
    setIsLoading(true)

    try {
      const response = await fetch('/api/members/invite', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName }),
      })
      const body = (await response.json()) as InviteResult

      if (!response.ok) {
        throw new Error(body.errors?.[0]?.message || '邀請失敗')
      }

      setResult(body)
      setEmail('')
      setDisplayName('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '邀請失敗')
    } finally {
      setIsLoading(false)
    }
  }

  const copyLink = async () => {
    if (!result?.inviteLink) return
    await navigator.clipboard.writeText(result.inviteLink)
    setCopied(true)
  }

  return (
    <section
      data-testid="invite-member"
      style={{
        border: '1px solid var(--theme-elevation-150)',
        padding: 'var(--base)',
        marginBottom: 'var(--base)',
      }}
    >
      <h4 style={{ marginTop: 0 }}>邀請會員</h4>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', marginBottom: 4 }}>郵箱</span>
          <input
            data-testid="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="someone@example.com"
          />
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', marginBottom: 4 }}>顯示名稱（選填）</span>
          <input
            data-testid="invite-display-name"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="作者別名"
          />
        </label>
        <Button
          buttonStyle="secondary"
          disabled={isLoading}
          onClick={invite}
          type="button"
        >
          {isLoading ? '邀請中…' : '送出邀請'}
        </Button>
      </div>

      {error ? (
        <p data-testid="invite-error" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div data-testid="invite-result" style={{ marginTop: 12 }}>
          {result.sent ? (
            <p>已寄出邀請信到 {result.email}。連結 7 天內有效。</p>
          ) : (
            <>
              <p>
                帳號已建立。
                {result.emailError
                  ? `寄信失敗（${result.emailError}），`
                  : '目前未設定寄信服務，'}
                請把下面的連結傳給對方，7 天內有效：
              </p>
              <code
                data-testid="invite-link"
                style={{ display: 'block', wordBreak: 'break-all', padding: 8 }}
              >
                {result.inviteLink}
              </code>
              <Button buttonStyle="secondary" onClick={copyLink} type="button">
                {copied ? '已複製' : '複製連結'}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
