import { DecoratorBlockNode } from '@payloadcms/richtext-lexical/lexical/react/LexicalDecoratorBlockNode'

import type {
  ElementFormatType,
  LexicalNode,
  Spread,
} from '@payloadcms/richtext-lexical/lexical'
import type { SerializedDecoratorBlockNode } from '@payloadcms/richtext-lexical/lexical/react/LexicalDecoratorBlockNode'

/**
 * An upload that is still being sent to R2.
 *
 * A *separate node type* rather than a `pending` key on MemberUploadNode
 * (which is how Payload's own upload feature models it). The difference is
 * the point: an in-flight upload has no media id, so a node representing
 * one must never be able to serialize as an `upload` node. Giving it its
 * own type means `toPayloadContent` can refuse the whole save on sight —
 * see serialize.ts — instead of relying on every writer to remember to
 * strip a flag off an otherwise-valid-looking node.
 *
 * `src` is a blob: URL for local preview only. It is never persisted:
 * this type is not in RECOGNIZED_TYPES for load purposes, and a save
 * carrying one throws.
 */
export type PendingUploadData = {
  /** Correlates the node with the upload driving it. */
  uploadId: string
  /** Object URL for the local preview while the bytes are in flight. */
  src: string
}

export type SerializedPendingUploadNode = Spread<
  { uploadId: string; src: string },
  SerializedDecoratorBlockNode
>

export class PendingUploadNode extends DecoratorBlockNode {
  __pending: PendingUploadData

  constructor(pending: PendingUploadData, format?: ElementFormatType, key?: string) {
    super(format, key)
    this.__pending = pending
  }

  static getType(): string {
    return 'member-pending-upload'
  }

  static clone(node: PendingUploadNode): PendingUploadNode {
    return new PendingUploadNode(node.__pending, node.__format, node.__key)
  }

  static importJSON(serializedNode: SerializedPendingUploadNode): PendingUploadNode {
    return $createPendingUploadNode({
      uploadId: serializedNode.uploadId,
      src: serializedNode.src,
    })
  }

  exportJSON(): SerializedPendingUploadNode {
    return {
      ...super.exportJSON(),
      ...this.getPending(),
      type: 'member-pending-upload',
      version: 1,
    } as SerializedPendingUploadNode
  }

  getPending(): PendingUploadData {
    return this.getLatest().__pending
  }

  decorate() {
    return (
      <div
        data-testid="editor-upload-pending"
        data-upload-id={this.__pending.uploadId}
        className="relative my-4 border border-border"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={this.__pending.src}
          alt=""
          className="block max-h-96 w-full object-contain opacity-40"
        />
        <div className="absolute inset-0 flex items-center justify-center text-sm text-foreground/70">
          上傳中…
        </div>
      </div>
    )
  }

  isInline(): false {
    return false
  }
}

export function $createPendingUploadNode(pending: PendingUploadData): PendingUploadNode {
  return new PendingUploadNode(pending)
}

export function $isPendingUploadNode(
  node: LexicalNode | null | undefined,
): node is PendingUploadNode {
  return node instanceof PendingUploadNode
}
