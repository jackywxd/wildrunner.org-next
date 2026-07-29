import { createEditor } from '@payloadcms/richtext-lexical/lexical'

import { EDITOR_NODES } from './nodes'

import type { LexicalEditor } from '@payloadcms/richtext-lexical/lexical'

/**
 * A headless editor instance: no DOM, no toolbar, no plugins — just the
 * registered node set. Used by the Phase B fidelity harness to prove a
 * round trip, and reused as the base config for the real editor UI (Phase
 * F adds theme classes and mounts it inside LexicalComposer instead of
 * calling createEditor directly).
 */
export function createMemberEditor(): LexicalEditor {
  return createEditor({
    namespace: 'wildrunner-member-editor',
    nodes: EDITOR_NODES,
    onError: (error: Error) => {
      throw error
    },
  })
}
