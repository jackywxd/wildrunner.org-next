import { $applyNodeReplacement, ElementNode } from '@payloadcms/richtext-lexical/lexical'

import { newObjectIdHex } from '../object-id'

import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
} from '@payloadcms/richtext-lexical/lexical'

/**
 * Payload's own `link` node (@payloadcms/richtext-lexical/dist/features/
 * link/nodes/LinkNode.js) — not `@lexical/link`'s stock LinkNode. The shapes
 * differ: Payload nests url/newTab/linkType inside a `fields` object plus a
 * node-level `id`; `@lexical/link` puts url/target/rel directly on the node
 * with no `id`. The corpus (see PLAN-members / node census) only exercises
 * `linkType: 'custom'`, so `internal` (Payload's own doc-relationship link
 * type) isn't implemented here — a link of that kind falls through to
 * UnknownNode and round-trips losslessly rather than being misrendered.
 */
export type MemberLinkFields = {
  linkType: 'custom'
  newTab: boolean
  url: string
}

export type SerializedMemberLinkNode = Spread<
  { fields: MemberLinkFields; id: string },
  SerializedElementNode
>

export class MemberLinkNode extends ElementNode {
  __fields: MemberLinkFields
  __id: string

  constructor(fields: MemberLinkFields, id: string, key?: NodeKey) {
    super(key)
    this.__fields = fields
    this.__id = id
  }

  static getType(): string {
    return 'link'
  }

  static clone(node: MemberLinkNode): MemberLinkNode {
    return new MemberLinkNode(node.__fields, node.__id, node.__key)
  }

  static importJSON(serializedNode: SerializedMemberLinkNode): MemberLinkNode {
    const node = $createMemberLinkNode(serializedNode.fields, serializedNode.id)
    node.setFormat(serializedNode.format)
    node.setIndent(serializedNode.indent)
    node.setDirection(serializedNode.direction)
    return node
  }

  exportJSON(): SerializedMemberLinkNode {
    return {
      ...super.exportJSON(),
      type: 'link',
      version: 3,
      fields: this.getFields(),
      id: this.getID(),
    }
  }

  static importDOM(): DOMConversionMap | null {
    // Same reasoning as MemberUploadNode.importDOM: real link creation goes
    // through the toolbar/command in Phase F, not raw DOM paste conversion.
    return null
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('a')
    element.href = this.__fields.url
    if (this.__fields.newTab) element.target = '_blank'
    if (config.theme.link) element.className = config.theme.link
    return element
  }

  updateDOM(): boolean {
    return false
  }

  exportDOM(): DOMExportOutput {
    return { element: this.createDOM({ theme: {} } as EditorConfig) }
  }

  getFields(): MemberLinkFields {
    return this.getLatest().__fields
  }

  setFields(fields: MemberLinkFields): void {
    const writable = this.getWritable()
    writable.__fields = fields
  }

  getID(): string {
    return this.getLatest().__id
  }

  isInline(): true {
    return true
  }
}

export function $createMemberLinkNode(
  fields: MemberLinkFields,
  id: string = newObjectIdHex(),
): MemberLinkNode {
  return $applyNodeReplacement(new MemberLinkNode(fields, id))
}

export function $isMemberLinkNode(node: LexicalNode | null | undefined): node is MemberLinkNode {
  return node instanceof MemberLinkNode
}
