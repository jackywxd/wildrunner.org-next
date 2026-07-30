import { createMemberEditor } from './config'
import { RECOGNIZED_TYPES } from './nodes'

/**
 * Loosely-typed JSON shape for a Lexical serialized node. Deliberately not
 * `SerializedLexicalNode` from the `lexical` proxy: these functions operate
 * on plain JSON — Payload's stored `content` value and the output of
 * `editorState.toJSON()` — before or after Lexical's own typed node classes
 * are involved at all.
 */
export type JsonNode = {
  type: string
  children?: JsonNode[]
  [key: string]: unknown
}

export type PayloadContent = { root: JsonNode }

const UNKNOWN_TYPE = 'unknown-passthrough'
const PENDING_UPLOAD_TYPE = 'member-pending-upload'

/**
 * Prepare stored Payload content for a Lexical editor built from
 * `EDITOR_NODES`. Every node whose `type` this editor has no class for gets
 * swapped for an `unknown-passthrough` wrapper carrying the original subtree
 * untouched, *before* the result ever reaches Lexical's parser — Lexical
 * throws on an unregistered type during `$parseSerializedNode`
 * (`editor.parseEditorState`), so the swap has to happen here, not there.
 *
 * Recognized nodes are returned as-is except that their own `children` (if
 * any) go through the same transform, so an unrecognized type nested inside
 * a recognized container — some future inline node inside a paragraph, say
 * — is still caught. An unrecognized node's *own* children are not
 * recursed into: they stay embedded verbatim inside `payload`, since without
 * a class for the parent type its child schema isn't something this editor
 * can reason about anyway.
 */
export function fromPayloadContent(content: PayloadContent): PayloadContent {
  return { root: walkDown(content.root) }
}

function walkDown(node: JsonNode): JsonNode {
  if (!RECOGNIZED_TYPES.has(node.type)) {
    return { type: UNKNOWN_TYPE, version: 1, payload: node }
  }
  if (!Array.isArray(node.children)) return node
  return { ...node, children: node.children.map(walkDown) }
}

/**
 * Reverse `fromPayloadContent` on save. `editorState.toJSON()` emits an
 * `unknown-passthrough` node (type === getType(), per Lexical's own
 * `exportNodeToJSON` assertion — see UnknownNode's comment) wherever an
 * `UnknownNode` sat in the tree; this walks the exported JSON and replaces
 * each one with its stashed `payload`, restoring the original subtree
 * byte-for-byte. Recurses into ordinary nodes' `children` the same way
 * `walkDown` does, since a passthrough node can be nested at any depth.
 */
export function toPayloadContent(exported: PayloadContent): PayloadContent {
  return { root: walkUp(exported.root) }
}

function walkUp(node: JsonNode): JsonNode {
  // An upload still in flight has no media id, so there is nothing valid to
  // write. Throwing here — rather than dropping the node or writing a
  // placeholder — means a save cannot silently lose an image the author can
  // still see on screen. The editor also disables saving while any pending
  // node exists; this is the structural backstop behind that.
  if (node.type === PENDING_UPLOAD_TYPE) {
    throw new Error('Cannot save while an upload is still in progress')
  }
  if (node.type === UNKNOWN_TYPE) {
    // Not recursed into further: `payload` is the original subtree exactly
    // as it was captured, already in its final, wanted form.
    return node.payload as JsonNode
  }
  if (!Array.isArray(node.children)) return node
  return { ...node, children: node.children.map(walkUp) }
}

/**
 * `fromPayloadContent` -> parse into a fresh headless editor -> re-export ->
 * `toPayloadContent`, in one call. This is the entire fidelity contract this
 * editor makes with Payload: for any real post, the result must deep-equal
 * the input. A fresh `createMemberEditor()` per call rather than a shared
 * instance — round-tripping many posts in one process (the Phase B harness
 * does all of them) must not let one post's parsed state leak into the
 * next's.
 *
 * No `editor.setEditorState()` call: `EditorState.toJSON()` calls
 * `readEditorState(null, this, ...)` internally, which is sufficient
 * context for every node's `exportJSON` here (none of them call
 * `getActiveEditor()`) — parsing and exporting both operate on the
 * `EditorState` object `parseEditorState` returns, without needing it
 * attached to the editor as the "current" state.
 */
export function roundTripPayloadContent(content: PayloadContent): PayloadContent {
  const editor = createMemberEditor()
  const prepared = fromPayloadContent(content)
  const parsed = editor.parseEditorState(JSON.stringify(prepared))
  const exported = parsed.toJSON() as PayloadContent
  const restored = toPayloadContent(exported)

  // Canonicalize through the same JSON.stringify a real save already goes
  // through — `fetch(url, {body: JSON.stringify(toPayloadContent(...))})`
  // in the real editor, and D1's TEXT column in Payload's own writes —
  // rather than comparing raw in-memory objects. @lexical/list's
  // ListItemNode.exportJSON() always sets `checked: this.getChecked()`,
  // which is `undefined` for a plain bullet item; the stored corpus never
  // has that key because it was written through a JSON.stringify at some
  // point (which drops undefined-valued keys), while the in-memory object
  // this function would otherwise return still carries it. Comparing
  // without this step reports a difference that can never actually reach
  // Payload over a real save.
  return JSON.parse(JSON.stringify(restored)) as PayloadContent
}
