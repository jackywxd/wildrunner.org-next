import { DecoratorBlockNode } from '@payloadcms/richtext-lexical/lexical/react/LexicalDecoratorBlockNode'

import { newObjectIdHex } from '../object-id'

import type {
  DOMConversionMap,
  DOMExportOutput,
  ElementFormatType,
  LexicalNode,
  Spread,
} from '@payloadcms/richtext-lexical/lexical'
import type { SerializedDecoratorBlockNode } from '@payloadcms/richtext-lexical/lexical/react/LexicalDecoratorBlockNode'

/**
 * Matches Payload's own `UploadServerNode`
 * (@payloadcms/richtext-lexical/dist/features/upload/server/nodes/UploadNode.js)
 * exactly: same `getType()`, same fields on `exportJSON`. That shape is
 * what `src/components/payload-rich-text.tsx`'s `upload` converter and
 * Payload's server-side relationship population both key off — `relationTo`
 * has to be the literal string `'media'`, and `value` a plain id, never a
 * populated object.
 *
 * Deliberately headless like Payload's own server node: `decorate()` returns
 * null. Payload has a *separate* client node for the browser editor with a
 * real React decorate(); ours will get one in the member editor UI (Phase
 * F). This file only has to be correct for import/export, which is all the
 * Phase B fidelity harness exercises.
 */
export type UploadData = {
  fields?: Record<string, unknown>
  id?: string
  relationTo: string
  value: number | string
}

export type SerializedMemberUploadNode = Spread<
  { relationTo: string; value: number | string; fields?: Record<string, unknown> },
  SerializedDecoratorBlockNode
>

export class MemberUploadNode extends DecoratorBlockNode {
  __data: UploadData

  constructor(data: UploadData, format?: ElementFormatType, key?: string) {
    super(format, key)
    this.__data = data
  }

  static getType(): string {
    return 'upload'
  }

  static clone(node: MemberUploadNode): MemberUploadNode {
    return new MemberUploadNode(node.__data, node.__format, node.__key)
  }

  static importJSON(serializedNode: SerializedMemberUploadNode): MemberUploadNode {
    const node = $createMemberUploadNode({
      id: (serializedNode as { id?: string }).id,
      fields: serializedNode.fields,
      relationTo: serializedNode.relationTo,
      value: serializedNode.value,
    })
    node.setFormat(serializedNode.format)
    return node
  }

  exportJSON(): SerializedMemberUploadNode {
    return {
      ...super.exportJSON(),
      ...this.getData(),
      type: 'upload',
      version: 3,
    } as SerializedMemberUploadNode
  }

  static importDOM(): DOMConversionMap | null {
    // Real DOM paste-conversion (screenshots, dragged images) is handled by
    // the paste plugin (Phase F), which goes through direct-upload.ts to get
    // a real media id before a node is ever created — there is no
    // meaningful "convert this <img> to an upload node" step here the way
    // Payload's own importDOM has, since we never want an <img src> to
    // become the node's data directly.
    return null
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-member-upload-id', String(this.getData().value))
    return { element }
  }

  getData(): UploadData {
    return this.getLatest().__data
  }

  setData(data: UploadData): void {
    const writable = this.getWritable()
    writable.__data = data
  }

  decorate() {
    return null
  }

  isInline(): false {
    return false
  }
}

export function $createMemberUploadNode(data: UploadData): MemberUploadNode {
  if (!data.id) data.id = newObjectIdHex()
  return new MemberUploadNode(data)
}

export function $isMemberUploadNode(
  node: LexicalNode | null | undefined,
): node is MemberUploadNode {
  return node instanceof MemberUploadNode
}
