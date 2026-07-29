import { $applyNodeReplacement, DecoratorNode } from '@payloadcms/richtext-lexical/lexical'

import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
} from '@payloadcms/richtext-lexical/lexical'

/**
 * A node whose type this editor doesn't have a class for — a `table` from
 * `EXPERIMENTAL_TableFeature()`, a `block` from `BlocksFeature({blocks:
 * [CodeBlock()]})`, or anything else added to the root Lexical config later.
 * Neither appears in the current corpus, but both can exist the moment an
 * admin edits a post in the full /admin editor, and Lexical throws on an
 * unregistered `type` during `$parseSerializedNode` — this node exists so
 * that never happens here.
 *
 * `serialize.ts`'s `fromPayloadContent` swaps an unrecognized subtree for
 * `{type: 'unknown-passthrough', payload: <original subtree, untouched>}`
 * *before* handing anything to Lexical's own parser — this class never
 * interprets `payload`, just carries it. `toPayloadContent` reverses that
 * substitution on save (an explicit walk-and-unwrap, not something this
 * class's `exportJSON` can do itself — see below), so the original subtree
 * — nested children and all — comes back out byte-for-byte. Round-tripped
 * opaquely rather than parsed: we don't know the child schema of a type we
 * don't have a class for, so reconstructing it as real Lexical children
 * isn't possible in general.
 *
 * `exportJSON` cannot simply return `this.__payload` unchanged: Lexical's
 * own serializer (`exportNodeToJSON` in lexical's core) asserts
 * `serializedNode.type === nodeClass.getType()` and throws otherwise, so a
 * stashed `{type:'table',...}` payload returned from a node whose
 * `getType()` is `'unknown-passthrough'` would fail that assertion. The
 * payload has to travel inside a same-typed envelope instead, unwrapped one
 * layer up in `toPayloadContent`.
 */
export type SerializedUnknownNode = SerializedLexicalNode & {
  payload: Record<string, unknown>
}

export class UnknownNode extends DecoratorNode<null> {
  __payload: Record<string, unknown>

  constructor(payload: Record<string, unknown>, key?: NodeKey) {
    super(key)
    this.__payload = payload
  }

  static getType(): string {
    return 'unknown-passthrough'
  }

  static clone(node: UnknownNode): UnknownNode {
    return new UnknownNode(node.__payload, node.__key)
  }

  static importJSON(serializedNode: SerializedUnknownNode): UnknownNode {
    return $createUnknownNode(serializedNode.payload)
  }

  exportJSON(): SerializedUnknownNode {
    // Must satisfy Lexical's own type === getType() assertion — see the
    // class comment. `toPayloadContent` is what actually restores the
    // original subtree from `payload`.
    return { type: 'unknown-passthrough', version: 1, payload: this.__payload }
  }

  static importDOM(): DOMConversionMap | null {
    return null
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    if (config.theme.unknown) element.className = config.theme.unknown
    element.setAttribute('data-unknown-node-type', String(this.__payload.type ?? ''))
    return element
  }

  exportDOM(): DOMExportOutput {
    return { element: document.createElement('div') }
  }

  updateDOM(): boolean {
    return false
  }

  isInline(): false {
    return false
  }

  decorate() {
    return null
  }
}

export function $createUnknownNode(
  payload: Record<string, unknown>,
  key?: NodeKey,
): UnknownNode {
  return $applyNodeReplacement(new UnknownNode(payload, key))
}

export function $isUnknownNode(node: LexicalNode | null | undefined): node is UnknownNode {
  return node instanceof UnknownNode
}
