import { APIError } from "payload";

/**
 * One AI budget per member, shared by every endpoint that spends it.
 *
 * Extracted from `aiExpandPost.ts` when a second AI endpoint arrived. A
 * copy would have given each endpoint its own allowance under its own key,
 * so a member refused by one could carry straight on with the other — which
 * is not a limit, it is two limits that add up. The key is the member alone
 * for the same reason the original comment gives: not user+IP, so switching
 * network or User-Agent cannot reset it.
 *
 * Both callers count *before* parsing the request body, deliberately. When
 * this sat after validation, a malformed body was refused with a 400 without
 * ever being counted, so the endpoint could be hammered indefinitely as long
 * as every request was invalid — the limit is on asking, not on asking
 * correctly. It also made the limit untestable where it ships: reaching the
 * counter needed a valid request, a valid request runs real inference at
 * roughly ten seconds, and eleven of those outlast the sixty-second window.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

export async function checkAiRateLimit(db: D1Database, key: string): Promise<void> {
  const now = Date.now();
  const result = await db
    .prepare(
      `INSERT INTO ai_rate_limits (key, count, reset_at)
       VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE
           WHEN ai_rate_limits.reset_at < ?3 THEN 1
           ELSE ai_rate_limits.count + 1
         END,
         reset_at = CASE
           WHEN ai_rate_limits.reset_at < ?3 THEN ?2
           ELSE ai_rate_limits.reset_at
         END
       RETURNING count`,
    )
    .bind(key, now + WINDOW_MS, now)
    .first<{ count: number }>();

  if ((result?.count ?? 1) > MAX_PER_WINDOW) {
    throw new APIError("Too many AI requests", 429);
  }
}
