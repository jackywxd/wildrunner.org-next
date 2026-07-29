'use client'

import { Button, useField, useForm } from '@payloadcms/ui'
import { useState } from 'react'

import type { Post } from '@/payload-types'

import { useDict } from './i18n'

type ExpandResponse = {
  content?: Post['content']
  error?: string
}

const dict = {
  en: {
    heading: 'AI-assisted writing',
    placeholder:
      'Enter an outline or a rough draft; the result is written to the draft only and never published automatically.',
    outlineRequired: 'Enter an outline or a draft first.',
    serviceUnavailable: 'The AI service is temporarily unavailable',
    generating: 'Generating…',
    action: 'Expand with AI',
  },
  'zh-TW': {
    heading: 'AI 完善文章',
    placeholder: '輸入文章大綱或已有片段；生成結果只會寫入草稿，不會自動發布。',
    outlineRequired: '請先輸入大綱或文章片段。',
    serviceUnavailable: 'AI 服務暫時不可用',
    generating: '生成中…',
    action: 'AI 完善文章',
  },
}

export function AIAssistField() {
  const t = useDict(dict)
  const { value: title } = useField<string>({ path: 'title' })
  const { value: description } = useField<string>({ path: 'description' })
  const { dispatchFields, setModified } = useForm()
  const [outline, setOutline] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const expand = async () => {
    if (!outline.trim()) {
      setError(t.outlineRequired)
      return
    }

    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/ai/expand-post', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, outline }),
      })
      const result = (await response.json()) as ExpandResponse

      if (!response.ok || !result.content) {
        throw new Error(result.error || t.serviceUnavailable)
      }

      // The Lexical field only remounts its editor when `initialValue`
      // changes (see @payloadcms/richtext-lexical Field.js), so a plain
      // setValue() is silently ignored by the visible editor. Dispatching
      // UPDATE with both value and initialValue forces that remount.
      dispatchFields({
        type: 'UPDATE',
        path: 'content',
        value: result.content,
        initialValue: result.content,
        valid: true,
      })
      // dispatchFields alone doesn't flip the form's `modified` flag, so
      // Save Draft stays disabled unless we set it explicitly.
      setModified(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.serviceUnavailable)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section
      data-testid="ai-assist"
      style={{
        border: '1px solid var(--theme-elevation-150)',
        padding: 'var(--base)',
        marginBottom: 'var(--base)',
      }}
    >
      <label
        htmlFor="ai-assist-outline"
        style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}
      >
        {t.heading}
      </label>
      <textarea
        id="ai-assist-outline"
        data-testid="ai-assist-outline"
        rows={6}
        value={outline}
        onChange={(event) => setOutline(event.target.value)}
        placeholder={t.placeholder}
        style={{ width: '100%', marginBottom: 12 }}
      />
      <Button
        buttonStyle="secondary"
        disabled={isLoading}
        onClick={expand}
        type="button"
      >
        {isLoading ? t.generating : t.action}
      </Button>
      {error ? (
        <p data-testid="ai-assist-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
