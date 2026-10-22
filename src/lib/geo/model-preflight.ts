import type { AiProvider } from '../ai/provider'
import type { GeoMode } from './geocode-event'

/**
 * Whether a `pnpm geocode:events` run may start, decided before it writes
 * anything.
 *
 * WHY IT EXISTS. On 2026-10-21 `pnpm geocode:events:prod` ran from a laptop.
 * Production's `ai-settings` says Claude, and `ANTHROPIC_API_KEY` exists there
 * only as a Worker secret, which a laptop process never sees. Every model call
 * threw, `resolveEventGeo` turned each throw into `failed` as it is meant to
 * for a call that fails in transit, and 32 events were written `failed` —
 * among them all six World Marathon Majors. Nothing about the run was in
 * transit: it could not have called the model once, and that was knowable
 * before the first row.
 *
 * WHAT IT ASKS. Only whether the model can be called at all, and only when the
 * run will ask it something: an event with no edition location
 * (`resolveEventGeo`, step 1). Not whether it will answer well — a 429 or a
 * refusal is per-event and stays a per-event `failed`.
 *
 * THE STAND-IN NEVER REFUSES. `realAIAvailable()` false does not mean "the
 * model is unavailable" here; it means the run reads
 * data/race-event-places.csv and calls no one. That is the run `db:reset:local`
 * and CI's corpus seed make (scripts/lib/corpus.mjs), so refusing it would
 * break both while protecting nothing.
 *
 * WORKERS AI IS REACHABLE ONLY THROUGH A REMOTE SESSION. wrangler.jsonc
 * declares `AI` as `remote: true`, and a run without `--remote` opens no remote
 * session. wrangler still hands back an `AI` binding — it is not undefined —
 * but every call on it throws (miniflare's remote-proxy-client worker,
 * `throwRemoteRequired`). So the script passes `remote`, not "is there a
 * binding".
 *
 * `--skip-ai` places only the events with an edition location and leaves the
 * rest exactly as they are; it is the way to make progress without the model,
 * and it applies whichever provider is set.
 */

export type ModelPreflightInput = {
  mode: GeoMode
  /** Events this run would process that have no edition location. */
  needModel: number
  /** `resolveAiProvider(ai-settings.provider)`, as `callTextModel` reads it. */
  provider: AiProvider
  /** `process.env.ANTHROPIC_API_KEY` is non-empty, the test `callClaude` makes. */
  anthropicKeySet: boolean
  /** The run opened a remote session, so the `AI` binding reaches Workers AI. */
  workersAiReachable: boolean
  skipAi: boolean
  /** The command that was run, for the message: `pnpm geocode:events:prod`. */
  command: string
}

export type ModelPreflight =
  | { run: 'all' }
  | { run: 'edition-only'; skipped: number }
  | { run: 'refuse'; message: string }

export function modelPreflight(input: ModelPreflightInput): ModelPreflight {
  const { mode, needModel, provider, command } = input
  if (mode === 'stand-in' || needModel === 0) return { run: 'all' }
  if (input.skipAi) return { run: 'edition-only', skipped: needModel }

  const head =
    `已停止，沒有寫入任何資料：有 ${needModel} 個賽事沒有 edition 地點，要由 AI 判斷城市，但這次執行叫不到 AI。\n` +
    `Stopped before writing anything: ${needModel} events have no edition location and need the model, ` +
    `and this run cannot call it.\n`
  const skip =
    `  或加 --skip-ai，只處理有 edition 地點的賽事，其餘不動 / or add --skip-ai to place only ` +
    `the events with an edition location and leave the rest untouched:\n` +
    `       ${command} --skip-ai`

  if (provider === 'claude') {
    if (input.anthropicKeySet) return { run: 'all' }
    return {
      run: 'refuse',
      message:
        head +
        `AI 設定選了 Claude，但這個 process 沒有 ANTHROPIC_API_KEY（部署環境上它是 Worker secret，本機執行讀不到）。\n` +
        `ai-settings.provider is "claude" and ANTHROPIC_API_KEY is not set in this process ` +
        `(on a deployed environment it is a Worker secret, which a laptop run does not see).\n` +
        `修正方式（任選一）/ Either:\n` +
        `  1. 只為這一次指令提供 key / pass the key for this one command:\n` +
        `       ANTHROPIC_API_KEY=… ${command}\n` +
        `  2. 到 /admin 把 AI 設定改成 Workers AI，執行，再改回 Claude / ` +
        `switch ai-settings to Workers AI in /admin, run, then switch it back to Claude.\n` +
        skip,
    }
  }

  if (input.workersAiReachable) return { run: 'all' }
  return {
    run: 'refuse',
    message:
      head +
      `AI 設定是 Workers AI，但這次執行沒有 remote session，Workers AI 叫不到（只有 :staging / :prod 會開）。\n` +
      `ai-settings.provider is "workers-ai" and this run has no remote session: wrangler.jsonc declares AI ` +
      `remote-only, so without --remote every call on the binding throws.\n` +
      `修正方式（任選一）/ Either:\n` +
      `  1. 到 /admin 把 AI 設定改成 Claude，並提供 key / switch ai-settings to Claude in /admin and pass the key:\n` +
      `       ANTHROPIC_API_KEY=… ${command}\n` +
      skip,
  }
}
