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
 * Matches Payload's `HorizontalRuleServerNode` (@payloadcms/richtext-
 * lexical/dist/features/horizontalRule/server/nodes/HorizontalRuleNode.js):
 * `exportJSON` is just `{type:'horizontalrule', version:1}`, the smallest
 * node in the corpus. Headless for the same reason as MemberUploadNode —
 * `decorate()` returns null; Phase F's editor can add real DOM if it wants
 * a visible divider, without changing this contract.
 */
export class MemberHorizontalRuleNode extends DecoratorNode<null> {
  static getType(): string {
    return 'horizontalrule'
  }

  static clone(node: MemberHorizontalRuleNode): MemberHorizontalRuleNode {
    return new MemberHorizontalRuleNode(node.__key)
  }

  static importJSON(): MemberHorizontalRuleNode {
    return $createMemberHorizontalRuleNode()
  }

  exportJSON(): SerializedLexicalNode {
    return { type: 'horizontalrule', version: 1 }
  }

  static importDOM(): DOMConversionMap | null {
    return null
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('hr')
    if (config.theme.hr) element.className = config.theme.hr
    return element
  }

  exportDOM(): DOMExportOutput {
    return { element: document.createElement('hr') }
  }

  getTextContent(): string {
    return '\n'
  }

  isInline(): false {
    return false
  }

  updateDOM(): boolean {
    return false
  }

  decorate() {
    return null
  }
}

export function $createMemberHorizontalRuleNode(key?: NodeKey): MemberHorizontalRuleNode {
  return $applyNodeReplacement(new MemberHorizontalRuleNode(key))
}

export function $isMemberHorizontalRuleNode(
  node: LexicalNode | null | undefined,
): node is MemberHorizontalRuleNode {
  return node instanceof MemberHorizontalRuleNode
}
