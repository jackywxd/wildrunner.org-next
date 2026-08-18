'use client'

import { Button, useRouteCache } from '@payloadcms/ui'
import { useState } from 'react'

import { useDict } from './i18n'

type InviteResult = {
  email?: string
  sent?: boolean
  emailError?: string
  inviteLink?: string
  expiresAt?: string
  errors?: { message: string }[]
}

const dict = {
  en: {
    heading: 'Invite a member',
    email: 'Email',
    displayName: 'Display name (optional)',
    displayNamePlaceholder: 'Author alias',
    emailRequired: 'Enter an email address first.',
    inviteFailed: 'Invite failed',
    sending: 'Sending…',
    sendInvite: 'Send invite',
    sentTo: (email: string) => `Invite sent to ${email}. The link is valid for 7 days.`,
    accountCreated: 'Account created.',
    sendFailed: (reason: string) => `Sending the email failed (${reason}),`,
    noEmailConfigured: 'No email service is configured,',
    shareLink: 'share the link below instead — valid for 7 days:',
    copied: 'Copied',
    copyLink: 'Copy link',
  },
  'zh-TW': {
    heading: '邀請會員',
    email: '郵箱',
    displayName: '顯示名稱（選填）',
    displayNamePlaceholder: '作者別名',
    emailRequired: '請先輸入郵箱。',
    inviteFailed: '邀請失敗',
    sending: '邀請中…',
    sendInvite: '送出邀請',
    sentTo: (email: string) => `已寄出邀請信到 ${email}。連結 7 天內有效。`,
    accountCreated: '帳號已建立。',
    sendFailed: (reason: string) => `寄信失敗（${reason}），`,
    noEmailConfigured: '目前未設定寄信服務，',
    shareLink: '請把下面的連結傳給對方，7 天內有效：',
    copied: '已複製',
    copyLink: '複製連結',
  },
}

export function InviteMemberPanel() {
  const t = useDict(dict)
  /**
   * Payload's own way of getting fresh list data after a mutation:
   * `clearRouteCache` is a `router.refresh()`, and the list view uses exactly
   * that (`views/List/index.js` sets `onSuccess` to `router.refresh`).
   *
   * NOT `useListQuery().refineListData`, which looks like the obvious choice
   * and silently does nothing here: it merges the incoming query into the
   * current one and only navigates `if (window.location.search !== search)`.
   * Re-running the *same* query produces the same search string, so there is
   * no navigation and no refetch — the invited member would still be missing
   * from the table.
   */
  const { clearRouteCache } = useRouteCache()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [result, setResult] = useState<InviteResult | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const invite = async () => {
    if (!email.trim()) {
      setError(t.emailRequired)
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
        throw new Error(body.errors?.[0]?.message || t.inviteFailed)
      }

      setResult(body)
      setEmail('')
      setDisplayName('')
      // The invite created a user row, and the table below is server-rendered
      // — without this it keeps showing the list as it was before the invite.
      clearRouteCache()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.inviteFailed)
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
      <h4 style={{ marginTop: 0 }}>{t.heading}</h4>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', marginBottom: 4 }}>{t.email}</span>
          <input
            data-testid="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="someone@example.com"
          />
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', marginBottom: 4 }}>{t.displayName}</span>
          <input
            data-testid="invite-display-name"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={t.displayNamePlaceholder}
          />
        </label>
        {/* `margin={false}` is what makes this line up with the two inputs.
            Payload's `.btn` carries `margin-block: calc(var(--base) * 1.2)`
            and the component defaults the prop to `true`, so inside a
            `align-items: flex-end` row that bottom margin lifts the button
            clear of the fields it belongs with. */}
        <Button
          buttonStyle="secondary"
          disabled={isLoading}
          margin={false}
          onClick={invite}
          type="button"
        >
          {isLoading ? t.sending : t.sendInvite}
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
            <p>{t.sentTo(result.email ?? '')}</p>
          ) : (
            <>
              <p>
                {t.accountCreated}
                {result.emailError ? t.sendFailed(result.emailError) : t.noEmailConfigured}
                {t.shareLink}
              </p>
              <code
                data-testid="invite-link"
                style={{ display: 'block', wordBreak: 'break-all', padding: 8 }}
              >
                {result.inviteLink}
              </code>
              <Button buttonStyle="secondary" onClick={copyLink} type="button">
                {copied ? t.copied : t.copyLink}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
