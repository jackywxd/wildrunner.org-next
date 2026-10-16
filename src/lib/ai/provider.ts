/**
 * The AI backends an admin can choose between, and how a stored choice is read.
 *
 * Separate from `call-model.ts` for the reason `reply-text.ts` is: that file
 * cannot be imported without Payload and the Cloudflare context, and this is
 * the piece worth pinning without either. The global imports the list from
 * here too, so the options the admin sees and the values the dispatcher
 * understands cannot drift apart.
 */

export const AI_PROVIDERS = ["workers-ai", "claude"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

/**
 * Workers AI, because it is what every environment ran before the choice
 * existed. So applying the migration — and every database that has never had
 * the global saved — behaves exactly as before until an admin says otherwise.
 */
export const DEFAULT_AI_PROVIDER: AiProvider = "workers-ai";

/**
 * The provider a stored value names, or the default.
 *
 * The row is nullable in practice: a global that has never been saved has no
 * row at all, and `findGlobal` then answers with the field missing. Anything
 * that is not one of the known values — a missing row, a null, a value from a
 * later version of this list that a rollback no longer knows — means the
 * default, never "whatever happens next in the dispatcher".
 */
export function resolveAiProvider(stored: unknown): AiProvider {
  return (AI_PROVIDERS as readonly unknown[]).includes(stored)
    ? (stored as AiProvider)
    : DEFAULT_AI_PROVIDER;
}
