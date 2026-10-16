import type { GlobalConfig } from 'payload'

import { isAdmin, isAdminUser } from '../access'
import { AI_PROVIDERS, DEFAULT_AI_PROVIDER } from '../lib/ai/provider'

/**
 * Which service answers the members' AI buttons — 完善, 摘要, 改錯字, 擴寫,
 * and the narration rewrite.
 *
 * A GLOBAL OF ITS OWN, NOT A FIELD ON `site`. `site` is readable by anyone
 * (`read: () => true`, because the public pages render it) and every save of
 * it revalidates the whole site. Neither fits a backend switch: there is no
 * reason a visitor should be able to ask which AI vendor the club uses, and
 * flipping it changes nothing that renders.
 *
 * THE KEY IS NOT HERE, AND MUST NEVER BE. The Anthropic key is a Worker
 * secret (`ANTHROPIC_API_KEY`), read per request in `call-model.ts`. This
 * repository is public and a column in D1 ends up in exports, staging syncs
 * and backups; a secret does not. So choosing Claude here without the secret
 * set fails loudly at the first call rather than falling back — a quiet
 * fallback would leave an admin believing they had switched when they had not.
 *
 * Text only. Narration's *voice* stays on Workers AI whatever this says:
 * Anthropic has no speech model, and `speak.ts` keeps using the `AI` binding.
 */
export const AiSettings: GlobalConfig = {
  slug: 'ai-settings',
  label: { en: 'AI Settings', 'zh-TW': 'AI 設定' },
  admin: {
    hidden: ({ user }) => !isAdminUser(user),
  },
  access: {
    // Admin-only both ways. The endpoints read it through the local API,
    // which bypasses access, so nothing a member does needs read rights.
    read: isAdmin,
    update: isAdmin,
  },
  fields: [
    {
      name: 'provider',
      type: 'select',
      label: { en: 'AI backend', 'zh-TW': 'AI 後台' },
      required: true,
      defaultValue: DEFAULT_AI_PROVIDER,
      options: AI_PROVIDERS.map((value) => ({
        value,
        label:
          value === 'claude'
            ? { en: 'Claude (Anthropic API)', 'zh-TW': 'Claude（Anthropic API）' }
            : { en: 'Cloudflare Workers AI', 'zh-TW': 'Cloudflare Workers AI' },
      })),
      admin: {
        description: {
          en: 'Used by every member-facing AI feature. Claude needs the ANTHROPIC_API_KEY secret on this environment; without it every AI call fails with a message saying so. Narration voice always uses Workers AI.',
          'zh-TW':
            '會員所有 AI 功能都用這裡選的後台。選 Claude 前，這個環境必須已設定 ANTHROPIC_API_KEY secret，否則每次呼叫都會失敗並顯示原因。朗讀的語音一律使用 Workers AI。',
        },
      },
    },
  ],
}
