'use client'

import { useTranslation } from '@payloadcms/ui'

/**
 * Locale for the four custom admin panels (InviteMemberPanel,
 * StorageQuotaField, LargeUploadPanel, AIAssistField).
 *
 * Payload's own `t()` resolves against a specific nested key structure per
 * namespace (`general:save`, `authentication:login`, …) merged from
 * `@payloadcms/translations`. Registering our own strings into that same
 * structure via `config.i18n.translations` would work, but risks colliding
 * with namespaces Payload already owns and ties every string in these
 * panels to internals that aren't part of any documented contract.
 *
 * `useTranslation().i18n.language` is: the account's chosen language,
 * exactly `'en' | 'zh-TW'` once `supportedLanguages` in payload.config.ts is
 * set to those two. Reading it and picking from our own dictionary is still
 * "useTranslation with custom keys" — it just skips Payload's merge step
 * for strings this project owns outright.
 */
export function useAdminLocale(): 'en' | 'zh-TW' {
  const { i18n } = useTranslation()
  return i18n.language === 'en' ? 'en' : 'zh-TW'
}

// Values are usually strings, but a few need interpolation (a count, an
// email address baked into a sentence), so the value can be a function
// returning a string as well as a plain string.
export type Dict<T extends Record<string, string | ((...args: never[]) => string)>> = {
  en: T
  'zh-TW': T
}

export function useDict<T extends Record<string, string | ((...args: never[]) => string)>>(
  dict: Dict<T>,
): T {
  return dict[useAdminLocale()]
}
