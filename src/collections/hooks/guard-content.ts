import type { CollectionBeforeValidateHook } from 'payload'
import { ValidationError } from 'payload'

/**
 * A cheap, broad net against the entire class of damage a client-side bug
 * in the member editor could do to `content` — regardless of what the
 * client actually sent. Two things only the server can enforce:
 *
 * - an `upload` node's `value` must be a plain id (number or string), never
 *   a populated object. Loading a post at `depth >= 1` fills `value` with
 *   the full Media document; saving that back would corrupt the field
 *   Payload's own relationship population and the public `upload`
 *   converter in `payload-rich-text.tsx` both expect to be a bare id. The
 *   editor is required to load at `depth: 0` for exactly this reason — this
 *   hook is the check that catches it if that rule is ever broken.
 * - no node may carry a `pending` key. That marks an upload still in
 *   flight in the editor's in-memory state (see the paste-image plugin);
 *   `toPayloadContent()` is supposed to refuse to serialize while any
 *   pending node remains, so one reaching the server means that guard was
 *   bypassed somehow.
 *
 * Runs on both create and update. Not gated by whether `content` was even
 * part of this write (a PATCH that doesn't touch `content` won't have it
 * in `data` at all) — walking is a no-op when there's nothing to walk.
 */
export const guardPostContent: CollectionBeforeValidateHook = ({ data, req }) => {
  const content = (data as { content?: unknown } | undefined)?.content as
    | { root?: unknown }
    | undefined
  if (!content?.root) return data

  const problems: string[] = []
  walk(content.root, problems, 'content.root')

  if (problems.length > 0) {
    throw new ValidationError({
      errors: problems.map((message) => ({ path: 'content', message })),
      req,
    })
  }

  return data
}

function walk(node: unknown, problems: string[], path: string): void {
  if (!node || typeof node !== 'object') return
  const record = node as Record<string, unknown>

  if ('pending' in record && record.pending) {
    problems.push(`${path}: an upload here never finished (pending upload leaked into save)`)
  }

  if (record.type === 'upload') {
    const value = record.value
    if (typeof value !== 'number' && typeof value !== 'string') {
      problems.push(`${path}: upload value must be an id, not ${JSON.stringify(value)}`)
    }
  }

  if (Array.isArray(record.children)) {
    record.children.forEach((child, index) => walk(child, problems, `${path}.children[${index}]`))
  }
}
